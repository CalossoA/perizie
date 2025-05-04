"use strict";

// import
import http from "http";
import https from "https";
import fs from "fs";
import express from "express"; // @types/express
import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { Double, MongoClient, ObjectId } from "mongodb";
import cors from "cors"; // @types/cors
import fileUpload, { UploadedFile } from "express-fileupload";
import cloudinary, { UploadApiResponse } from "cloudinary";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fetch from "node-fetch"; // Assicurati di avere installato `node-fetch`
import nodemailer from "nodemailer";

// config
dotenv.config({ path: ".env" });
const app = express();
const HTTP_PORT = process.env.PORT || 3000; // Cambia 1337 in 3000 o un'altra porta libera
const DBNAME = "progetto-assicurazione";
const CONNECTION_STRING = process.env.connectionString;
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // Nome del tuo cloud
  api_key: process.env.CLOUDINARY_API_KEY, // Chiave API
  api_secret: process.env.CLOUDINARY_API_SECRET, // Segreto API
});
const whiteList = [
  "https://progettoassicurazioni-andreavaira.onrender.com",
  "http://localhost:1337",
  "https://localhost:1338",
  "https://192.168.1.70:1338",
  "https://10.88.205.125:1338",
  "https://cordovaapp",
];
const corsOptions = {
  origin: function (origin: any, callback: any) {
    return callback(null, true);
  },
  credentials: true,
};
const HTTPS_PORT = 1337;
const privateKey = fs.readFileSync("keys/privateKey.pem", "utf8");
const certificate = fs.readFileSync("keys/certificate.crt", "utf8");
const credentials = { key: privateKey, cert: certificate };
const DURATA_TOKEN = 30 * 24 * 60 * 60; // 30 giorni in secondi; // sec

// ***************************** Avvio ****************************************
const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, function () {
  init();
  console.log("Server HTTP in ascolto sulla porta " + HTTP_PORT);
});
let httpsServer = https.createServer(credentials, app);
httpsServer.listen(HTTPS_PORT, function () {
  console.log(
    "Server in ascolto sulle porte HTTP:" + HTTP_PORT + ", HTTPS:" + HTTPS_PORT
  );
});
let paginaErrore = "";
function init() {
  fs.readFile("./static/error.html", function (err, data) {
    if (!err) paginaErrore = data.toString();
    else paginaErrore = "<h1>Risorsa non trovata</h1>";
  });
}

/* *********************** (Sezione 2) Middleware ********************* */
// 1. Request log
app.use("/", function (req, res, next) {
  console.log("** " + req.method + " ** : " + req.originalUrl);
  next();
});

// 2 - risorse statiche
app.use("/", express.static("./static"));

// 3 - lettura dei parametri post
app.use("/", express.json({ limit: "20mb" }));
app.use("/", express.urlencoded({ extended: true, limit: "20mb" }));

// 4 - binary upload
app.use(
  "/",
  fileUpload({
    limits: { fileSize: 20 * 1024 * 1024 }, // 20*1024*1024 // 20 M
  })
);

// 5 - log dei parametri
app.use("/", function (req, res, next) {
  if (Object.keys(req.query).length > 0)
    console.log("        Parametri GET: ", req.query);
  if (Object.keys(req.body).length != 0)
    console.log("        Parametri BODY: ", req.body);
  next();
});

// 6. cors
app.use("/", cors(corsOptions));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// 7. gestione login
// First, let's create a middleware function to establish the database connection
function connectToDatabase(req: any, res: Response, next: NextFunction) {
  let connection = new MongoClient(CONNECTION_STRING as string);
  connection
    .connect()
    .then((client: any) => {
      req["connessione"] = client;
      next();
    })
    .catch((err: any) => {
      let msg = "Errore di connessione al db";
      res.status(503).send(msg);
    });
}

// Now modify your login route to use this middleware
app.post("/api/login", connectToDatabase, (req: any, res: Response) => {
  const { username, password } = req.body;

  // The rest of your existing login code...
  // Now req["connessione"] will be properly defined
  const collection = req["connessione"].db(DBNAME).collection("schemaOperatori");
  collection.findOne({ username }, function (err: Error, dbUser: any) {
    if (err) {
      console.log("Errore esecuzione query:" + err.message);
      res.status(500).send("Errore esecuzione query");
      req["connessione"].close();
    } else {
      if (!dbUser) {
        res.status(401).send("Username non valido");
        req["connessione"].close();
      } else {
        // Verifica la password
        bcrypt.compare(
          password,
          dbUser.password,
          function (err: Error | undefined, success: boolean) {
            if (err) {
              console.log("Errore bcrypt:" + err.message);
              res.status(500).send("Errore bcrypt");
              req["connessione"].close();
            } else {
              if (!success) {
                res.status(401).send("Password non valida");
                req["connessione"].close();
              } else {
                // Credenziali corrette, crea il token
                const token = createToken(dbUser);

                // Controlla se l'utente deve reimpostare la password
                if (dbUser.resetPassword) {
                  // Include il flag nel risultato per far sapere al client
                  // che deve chiedere il reset della password
                  res.send({
                    token,
                    resetPassword: true,
                    username: dbUser.username,
                    _id: dbUser._id,
                  });
                } else {
                  // Risposta normale per utenti con password già impostata
                  res.send({ token });
                }
                req["connessione"].close();
              }
            }
          }
        );
      }
    }
  });
});

function createToken(user: any) {
  let time: any = new Date().getTime() / 1000;
  let now = parseInt(time); // Data attuale espressa in secondi
  let payload = {
    iat: user.iat || now,
    exp: now + DURATA_TOKEN,
    _id: user._id.toString(), // Usa .toString() per ottenere l'ID come stringa
    email: user.email,
  };
  let token = jwt.sign(payload, privateKey);
  console.log("Creato nuovo token " + token);
  return token;
}

// 7 Bis gestione login google
app.post("/api/googleLogin", (req: Request, res: Response) => {
  let googleToken = req.body.token;
  let googleData: any = jwt.decode(googleToken);

  if (!googleData || !googleData.email) {
    return res.status(400).send("Token Google non valido.");
  }

  let connection = new MongoClient(CONNECTION_STRING as string);
  connection
    .connect()
    .then((client: MongoClient) => {
      const collection = client.db(DBNAME).collection("schemaOperatori");

      collection.findOne({ email: googleData.email }).then((operatore: any) => {
        if (!operatore || !operatore.abilitato) {
          res.status(401).send("Utente non abilitato.");
        } else {
          // Genera un token JWT
          let payload = {
            _id: operatore._id,
            email: operatore.email,
            username: operatore.username,
          };
          let token = jwt.sign(payload, privateKey, { expiresIn: "7d" }); // Token valido per 7 giorni
          res.setHeader("Authorization", token);
          res.setHeader("access-control-expose-headers", "Authorization");
          res.send({ ris: "ok" });
        }
      });
    })
    .catch((err: Error) => {
      console.error("Errore nella connessione al database:", err);
      res.status(503).send("Servizio database non disponibile.");
    });
});

// 8. gestione Logout

// 9. Controllo del Token
app.use("/api/verifyToken", function (req: any, res, next) {
  const token = req.headers["authorization"];
  console.log("Token ricevuto:", token);
  if (!token) {
    return res.status(403).send("Token mancante");
  }

  jwt.verify(token, privateKey, (err: any, payload: any) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        console.error("Token scaduto:", err);
        // Rigenera un nuovo token
        const newToken = jwt.sign(
          {
            _id: payload._id,
            username: payload.username,
            email: payload.email,
            isAdmin: payload.isAdmin || false,
          },
          privateKey,
          { expiresIn: "7d" } // Nuova durata del token
        );
        res.setHeader("Authorization", newToken);
        res.setHeader("access-control-expose-headers", "Authorization");
        req["payload"] = payload; // Imposta il payload nel req
        next();
      } else {
        console.error("Errore nella verifica del token:", err);
        return res.status(403).send("Token scaduto o corrotto");
      }
    } else {
      console.log("Token verificato con successo:", payload);
      req["payload"] = payload; // Imposta il payload nel req
      next();
    }
  });
});

app.get("/api/verifyToken", function (req: any, res: Response) {
  const token = req.headers["authorization"];
  console.log("Token ricevuto:", token);
  if (!token) {
    return res.status(403).send("Token mancante");
  }

  jwt.verify(token, privateKey, (err: any, payload: any) => {
    if (err) {
      console.error("Errore nella verifica del token:", err);
      return res.status(403).send("Token scaduto o corrotto");
    }

    console.log("Token verificato con successo:", payload);
    res.send({ success: true, payload });
  });
});

// 10. Apertura della connessione
app.use("/api/", function (req: any, res: Response, next: NextFunction) {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(403).send("Token mancante");
  }

  jwt.verify(token, privateKey, (err: any, payload: any) => {
    if (err) {
      console.error("Errore nella verifica del token:", err);
      return res.status(403).send("Token scaduto o corrotto");
    }

    console.log("Token verificato con successo:", payload);
    req["payload"] = payload; // Imposta il payload nel req
    next();
  });
});

app.use("/api/", function (req: any, res: any, next: NextFunction) {
  let connection = new MongoClient(CONNECTION_STRING as string);
  connection
    .connect()
    .then((client: any) => {
      req["connessione"] = client;
      next();
    })
    .catch((err: any) => {
      let msg = "Errore di connessione al db";
      res.status(503).send(msg);
    });
});

/* ********************* (Sezione 3) USER ROUTES  ************************** */

app.get("/api/MAP_KEY", (req: Request, res: Response) => {
  res.send({ key: process.env.MAP_KEY }); // Restituisce la chiave API di MapTiler
});

app.get("/api/perizie", (req: any, res: Response) => {
  const operatoreId = req.query.operatoreId;

  console.log("Parametro operatoreId ricevuto:", operatoreId); // Debug

  const query = operatoreId ? { codOperatore: operatoreId } : {};
  console.log("Query costruita:", query); // Debug

  const collection = req["connessione"].db(DBNAME).collection("schemaPerizie");
  collection.find(query).toArray((err: Error, data: any) => {
    if (err) {
      console.error("Errore durante il recupero delle perizie:", err);
      res.status(500).send("Errore durante il recupero delle perizie.");
    } else {
      console.log("Perizie trovate:", data); // Debug
      res.send(data);
    }
    req["connessione"].close();
  });
});

app.get("/api/perizieUtente", (req: any, res: Response, next: NextFunction) => {
  let collection = req["connessione"].db(DBNAME).collection("schemaPerizie");
  collection
    .find({ codOperatore: req.query.codOperatore })
    .toArray((err: Error, data: any) => {
      if (err) {
        res.status(500);
        res.send("Errore esecuzione query");
      } else {
        res.send(data);
      }
      req["connessione"].close();
    });
});

app.get("/api/perizie/:id", (req: any, res: Response, next: NextFunction) => {
  let _id = new ObjectId(req.params.id);
  let collection = req["connessione"].db(DBNAME).collection("schemaPerizie");
  collection.findOne({ _id: _id }, (err: Error, data: any) => {
    if (err) {
      res.status(500).send("Errore esecuzione query");
    } else {
      res.send(data);
    }
    req["connessione"].close();
  });
});

app.put("/api/perizie/:id", async (req: any, res: Response) => {
  const periziaId = new ObjectId(req.params.id);
  const { descrizione } = req.body;

  const collectionPerizie = req["connessione"]
    .db(DBNAME)
    .collection("schemaPerizie");
  const collectionOperatori = req["connessione"]
    .db(DBNAME)
    .collection("schemaOperatori");

  try {
    // Trova la perizia per ottenere il codOperatore
    const perizia = await collectionPerizie.findOne({ _id: periziaId });
    if (!perizia) {
      return res.status(404).send("Perizia non trovata.");
    }

    // Trova l'operatore associato alla perizia
    const operatore = await collectionOperatori.findOne({
      _id: new ObjectId(perizia.codOperatore),
    });
    if (!operatore) {
      return res.status(404).send("Operatore non trovato.");
    }

    // Aggiorna la descrizione della perizia
    await collectionPerizie.updateOne(
      { _id: periziaId },
      { $set: { descrizione: descrizione } }
    );

    // Invia un'email all'utente
    sendEmail(
      operatore.email,
      "Modifica Perizia",
      `La descrizione della tua perizia è stata aggiornata. Nuova descrizione: ${descrizione}`
    );

    res.send({ message: "Perizia aggiornata con successo e email inviata." });
  } catch (err) {
    console.error("Errore durante la modifica della perizia:", err);
    res.status(500).send("Errore durante la modifica della perizia.");
  } finally {
    req["connessione"].close();
  }
});

app.put("/api/perizie/:id/commento", (req: any, res: Response) => {
  try {
    const periziaId = new ObjectId(req.params.id);
    const { fotoIndex, commento } = req.body;

    if (fotoIndex === undefined || commento === undefined) {
      return res.status(400).send("Indice foto o commento mancante.");
    }

    const collection = req["connessione"]
      .db(DBNAME)
      .collection("schemaPerizie");

    // Crea il path di aggiornamento dinamicamente
    const updatePath: any = {};
    updatePath[`foto.${fotoIndex}.commento`] = commento;

    collection.updateOne(
      { _id: periziaId },
      { $set: updatePath },
      (err: Error, result: any) => {
        if (err) {
          console.error("Errore durante l'aggiornamento del commento:", err);
          res.status(500).send("Errore durante l'aggiornamento del commento.");
        } else if (result.modifiedCount === 0) {
          res
            .status(404)
            .send("Perizia non trovata o commento non modificato.");
        } else {
          res.send({
            success: true,
            message: "Commento aggiornato con successo.",
          });
        }
        req["connessione"].close();
      }
    );
  } catch (error) {
    console.error("Errore durante l'aggiornamento del commento:", error);
    res.status(500).send("Errore durante l'elaborazione della richiesta.");
    req["connessione"].close();
  }
});

app.put("/api/perizieCommento/:id", (req: any, res: Response) => {
  let _id = new ObjectId(req.params.id);
  let collection = req["connessione"].db(DBNAME).collection("schemaPerizie");
  collection.updateOne(
    { _id: _id },
    { $set: { "foto.0.commento": req.body.commento } },
    (err: Error, _: any) => {
      if (err) {
        res.status(500).send("Errore aggiornamento commento");
      } else {
        res.send({ message: "Commento aggiornato con successo" }); // Risposta JSON valida
      }
      req["connessione"].close();
    }
  );
});

app.get("/api/operatore", (req: any, res: Response, next: NextFunction) => {
  let _id = new ObjectId(req.query._id);
  let collection = req["connessione"].db(DBNAME).collection("schemaOperatori");
  collection.find({ _id: _id }).toArray((err: Error, data: any) => {
    if (err) {
      res.status(500);
      res.send("Errore esecuzione query");
    } else {
      res.send(data);
    }
    req["connessione"].close();
  });
});

app.get("/api/operatori", (req: any, res: Response) => {
  const collection = req["connessione"]
    .db(DBNAME)
    .collection("schemaOperatori");
  collection
    .find({ username: { $ne: "Admin" } }) // Escludi l'admin
    .toArray((err: Error, data: any) => {
      if (err) {
        console.error("Errore esecuzione query:", err);
        res.status(500).send("Errore esecuzione query");
      } else {
        res.send(data);
      }
      req["connessione"].close();
    });
});

app.post(
  "/api/aggiornaPerizia",
  async (req: any, res: Response, next: NextFunction) => {
    const { id, descrizione, foto } = req.body;

    if (!id || !descrizione || !foto || foto.length === 0) {
      return res.status(400).send("Dati mancanti o foto non presenti.");
    }

    try {
      // Carica le nuove foto su Cloudinary
      const fotoCaricate = await Promise.all(
        foto.map(async (item: any) => {
          if (item.img.startsWith("http")) {
            // Se l'immagine è già un URL (già caricata su Cloudinary), la manteniamo
            return item;
          } else {
            // Altrimenti, carichiamo l'immagine su Cloudinary
            const result = await cloudinary.v2.uploader.upload(item.img, {
              folder: "assicurazioni",
            });
            return { img: result.secure_url, commento: item.commento || "" };
          }
        })
      );

      // Aggiorna la perizia nel database
      const collection = req["connessione"]
        .db(DBNAME)
        .collection("schemaPerizie");
      collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { descrizione: descrizione, foto: fotoCaricate } },
        (err: Error, data: any) => {
          if (err) {
            console.error("Errore durante l'aggiornamento della perizia:", err);
            res
              .status(500)
              .send("Errore durante l'aggiornamento della perizia.");
          } else {
            res.send({ ris: "ok" });
          }
          req["connessione"].close();
        }
      );
    } catch (err) {
      console.error("Errore durante l'aggiornamento delle immagini:", err);
      res.status(500).send("Errore durante l'aggiornamento delle immagini.");
    }
  }
);

app.get(
  "/api/operatore1",
  (req: any, res: Response, next: NextFunction) => {
    const token = req.headers["authorization"];
    if (!token) {
      return res.status(403).send("Token mancante");
    }
    jwt.verify(token, privateKey, (err: any, payload: any) => {
      if (err) {
        console.error("Errore nella verifica del token:", err);
        return res.status(403).send("Token scaduto o corrotto");
      }
      req["payload"] = payload; // Imposta il payload nel req
      next();
    });
  },
  (req: any, res: Response) => {
    const collection = req["connessione"]
      .db(DBNAME)
      .collection("schemaOperatori");
    const _id = new ObjectId(req["payload"]._id);

    collection.findOne({ _id }, (err: Error, data: any) => {
      if (err) {
        res.status(500).send("Errore esecuzione query");
      } else {
        res.send(data);
      }
      req["connessione"].close();
    });
  }
);

app.post("/api/employ", (req: any, res: Response, next: NextFunction) => {
  let nome = req.body.name;
  let mail = req.body.mail;
  bcrypt.genSalt(10, function (err, salt) {
    bcrypt.hash("password", salt, function (err, hash) {
      let record = {
        password: hash,
        nome: nome,
        mail: mail,
        nPerizie: "0",
        '"img"':
          "https://res.cloudinary.com/dfrqbcbln/image/upload/v1672932919/assicurazioni/img_avatar_e9p0bx.png",
      };

      let collection = req["connessione"]
        .db(DBNAME)
        .collection("schemaOperatori");
      collection.insertOne(record, (err: Error, data: any) => {
        if (err) {
          res.status(500);
          res.send("Errore esecuzione query");
        } else {
          res.send({ ris: "ok" });
        }
        req["connessione"].close();
      });
    });
  });
});

app.get("/api/operatore1", (req: any, res: Response, next: NextFunction) => {
  let collection = req["connessione"].db(DBNAME).collection("schemaOperatori");
  console.log(req["payload"]._id);
  let _id = new ObjectId(req["payload"]._id);
  collection.find({ _id }).toArray((err: Error, data: any) => {
    if (err) {
      res.status(500);
      res.send("Errore esecuzione query");
    } else {
      res.send(data);
    }
    req["connessione"].close();
  });
});

app.post(
  "/api/updatePwd",
  (req: any, res: Response, next: NextFunction) => {
    const token = req.headers["authorization"];
    if (!token) {
      return res.status(403).send("Token mancante");
    }
    jwt.verify(token, privateKey, (err: any, payload: any) => {
      if (err) {
        console.error("Errore nella verifica del token:", err);
        return res.status(403).send("Token scaduto o corrotto");
      }
      if (!payload.resetPassword) {
        return res
          .status(403)
          .send("Non sei autorizzato a reimpostare la password.");
      }
      req["payload"] = payload; // Imposta il payload nel req
      next();
    });
  },
  (req: any, res: Response, next: NextFunction) => {
    console.log("Richiesta ricevuta per aggiornare la password:", req.body);
    console.log("Payload ricevuto dal token:", req["payload"]);

    let collection = req["connessione"]
      .db(DBNAME)
      .collection("schemaOperatori");
    let _id = new ObjectId(req["payload"]._id); // Usa l'ID dell'utente autenticato

    bcrypt.genSalt(10, function (err, salt) {
      if (err) {
        console.error("Errore durante la generazione del salt:", err);
        return res.status(500).send("Errore durante la generazione del salt.");
      }

      bcrypt.hash(req.body.pwd, salt, function (err, hash) {
        if (err) {
          console.error("Errore durante l'hashing della password:", err);
          return res
            .status(500)
            .send("Errore durante l'hashing della password.");
        }

        console.log("Password hashata:", hash);

        collection.updateOne(
          { _id },
          { $set: { password: hash, resetPassword: false } }, // Imposta resetPassword a false
          (err: Error, data: any) => {
            if (err) {
              console.error(
                "Errore durante l'aggiornamento della password:",
                err
              );
              return res
                .status(500)
                .send("Errore durante l'aggiornamento della password.");
            } else {
              console.log("Password aggiornata con successo:", data);
              res.send({ ris: "ok" });
            }
            req["connessione"].close();
          }
        );
      });
    });
  }
);

app.post("/api/updateOperatore", (req: any, res: Response) => {
  const _id = req["payload"]?._id; // Leggi l'ID dell'utente autenticato dal payload

  if (!_id) {
    return res.status(403).send("ID utente non trovato nel token.");
  }

  const img = req.body.img; // Immagine in formato base64
  if (!img) {
    return res.status(400).send("Immagine mancante.");
  }

  // Carica l'immagine su Cloudinary
  cloudinary.v2.uploader
    .upload(img, { folder: "assicurazioni/profili" }) // Salva nella cartella "profili"
    .then((result: UploadApiResponse) => {
      const collection = req["connessione"]
        .db(DBNAME)
        .collection("schemaOperatori");

      // Aggiorna il campo `img` nel database
      collection.updateOne(
        { _id: new ObjectId(_id) },
        { $set: { img: result.secure_url } },
        (err: Error, data: any) => {
          if (err) {
            console.error(
              "Errore durante l'aggiornamento della foto profilo:",
              err
            );
            res
              .status(500)
              .send("Errore durante l'aggiornamento della foto profilo.");
          } else {
            res.send({ ris: "ok", img: result.secure_url }); // Restituisce l'URL della nuova immagine
          }
          req["connessione"].close();
        }
      );
    })
    .catch((err: any) => {
      console.error("Errore durante il caricamento su Cloudinary:", err);
      res
        .status(500)
        .send("Errore durante il caricamento dell'immagine su Cloudinary.");
    });
});

// Elimina account
app.delete("/api/deleteAccount", (req: any, res: Response) => {
  let _id = new ObjectId(req["payload"]._id);

  let collection = req["connessione"].db(DBNAME).collection("schemaOperatori");
  collection.deleteOne({ _id }, (err: Error, data: any) => {
    if (err) {
      res.status(500).send("Errore durante l'eliminazione dell'account.");
    } else {
      res.send({ ris: "ok" });
    }
    req["connessione"].close();
  });
});

app.post("/api/newPhoto", (req: any, res: Response, next: NextFunction) => {
  cloudinary.v2.uploader
    .upload(req.body.img, { folder: "assicurazioni" })
    .then((result: UploadApiResponse) => {
      res.send({ path: result.secure_url });
    })
    .catch((err: any) => {
      res.status(500);
      res.send("Error upload file to Cloudinary. Error: " + err.message);
    });
});

app.post("/api/newReport", (req: any, res: Response, next: NextFunction) => {
  let record = req.body.record;
  record.codOperatore = req["payload"]._id;

  let collection = req["connessione"].db(DBNAME).collection("schemaPerizie");

  collection.insertOne(record, (err: Error, data: any) => {
    if (err) {
      res.status(500);
      res.send("Errore esecuzione query");
    } else {
      res.send({ ris: "ok" });
    }
    req["connessione"].close();
  });
});

app.post("/api/nuovoOperatore", (req: any, res: Response) => {
  const { nome, email, ruolo } = req.body;

  if (!nome || !email) {
    return res.status(400).send("Nome o email mancanti.");
  }

  // Hash della password iniziale
  bcrypt.genSalt(10, function (err, salt) {
    if (err) {
      console.error("Errore durante la generazione del salt:", err);
      return res.status(500).send("Errore durante la generazione del salt.");
    }

    bcrypt.hash("password", salt, function (err, hash) {
      if (err) {
        console.error("Errore durante l'hashing della password:", err);
        return res.status(500).send("Errore durante l'hashing della password.");
      }

      // Generate username based on nome (lowercase with no spaces)
      const username = nome.toLowerCase().replace(/\s+/g, "");

      // Crea il documento per il nuovo utente con il flag resetPassword
      const collection = req["connessione"].db(DBNAME).collection("schemaOperatori");
      collection.insertOne(
        {
          nome: nome,
          username: username,
          email: email,
          password: hash,
          ruolo: ruolo || "operatore",
          resetPassword: true, // Flag per richiedere il cambio password al primo accesso
          isAdmin: ruolo === "admin",
        },
        function (err: Error, result: any) {
          if (err) {
            console.error(
              "Errore durante l'inserimento del nuovo operatore:",
              err
            );
            res
              .status(500)
              .send("Errore durante l'inserimento del nuovo operatore.");
          } else {
            res.send({
              success: true,
              message: "Nuovo operatore aggiunto con successo.",
            });
          }
          req["connessione"].close();
        }
      );
    });
  });
});

app.post(
  "/api/nuovaPerizia",
  (req: any, res: Response, next: NextFunction) => {
    const token = req.headers["authorization"];
    if (!token) {
      return res.status(403).send("Token mancante");
    }
    jwt.verify(token, privateKey, (err: any, payload: any) => {
      if (err) {
        console.error("Errore nella verifica del token:", err);
        return res.status(403).send("Token scaduto o corrotto");
      }
      req["payload"] = payload; // Imposta il payload nel req
      next();
    });
  },
  async (req: any, res: Response) => {
    const { descrizione, foto, indirizzo } = req.body;
    const codOperatore = req["payload"]._id;

    if (!descrizione || !foto || foto.length === 0 || !indirizzo) {
      return res.status(400).send("Dati mancanti o foto non presenti.");
    }

    try {
      // Ottieni le coordinate dall'indirizzo utilizzando Nominatim
      const geocodingUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        indirizzo
      )}`;
      const response = await fetch(geocodingUrl);
      const data = (await response.json()) as any[];

      if (!data || data.length === 0) {
        return res.status(400).send("Indirizzo non valido.");
      }

      const coordinates = {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };

      // Carica le foto su Cloudinary
      const fotoCaricate = await Promise.all(
        foto.map(async (item: any) => {
          const result = await cloudinary.v2.uploader.upload(item.img, {
            folder: "assicurazioni",
          });
          return { img: result.secure_url, commento: item.commento || "" };
        })
      );

      // Genera automaticamente la data/ora e le coordinate
      const nuovaPerizia = {
        codOperatore: codOperatore,
        "data-ora": new Date().toISOString(),
        coordinate: coordinates,
        descrizione: descrizione,
        foto: fotoCaricate,
      };

      const collection = req["connessione"]
        .db(DBNAME)
        .collection("schemaPerizie");
      collection.insertOne(nuovaPerizia, (err: Error, data: any) => {
        if (err) {
          console.error("Errore durante l'inserimento della perizia:", err);
          res.status(500).send("Errore durante l'inserimento della perizia.");
        } else {
          res.send({ ris: "ok", id: data.insertedId });
        }
        req["connessione"].close();
      });
    } catch (err) {
      console.error("Errore durante la geocodifica con Nominatim:", err);
      res.status(500).send("Errore durante la geocodifica dell'indirizzo.");
    }
  }
);

app.delete("/api/perizie/:id", async (req: any, res: Response) => {
  const periziaId = new ObjectId(req.params.id);

  const collectionPerizie = req["connessione"]
    .db(DBNAME)
    .collection("schemaPerizie");
  const collectionOperatori = req["connessione"]
    .db(DBNAME)
    .collection("schemaOperatori");

  try {
    // Trova la perizia per ottenere il codOperatore
    const perizia = await collectionPerizie.findOne({ _id: periziaId });
    if (!perizia) {
      return res.status(404).send("Perizia non trovata.");
    }

    // Trova l'operatore associato alla perizia
    const operatore = await collectionOperatori.findOne({
      _id: new ObjectId(perizia.codOperatore),
    });
    if (!operatore) {
      return res.status(404).send("Operatore non trovato.");
    }

    // Elimina la perizia
    const result = await collectionPerizie.deleteOne({ _id: periziaId });
    if (result.deletedCount === 0) {
      return res.status(404).send("Perizia non trovata.");
    }

    // Invia un'email all'utente
    sendEmail(
      operatore.email,
      "Eliminazione Perizia",
      "La tua perizia è stata eliminata dal sistema."
    );

    res.send({ message: "Perizia eliminata con successo e email inviata." });
  } catch (err) {
    console.error("Errore durante l'eliminazione della perizia:", err);
    res.status(500).send("Errore durante l'eliminazione della perizia.");
  } finally {
    req["connessione"].close();
  }
});

app.post("/api/verificaPasswordAdmin", async (req: any, res: Response) => {
  const { password } = req.body;

  if (!password) {
    return res
      .status(400)
      .send({ success: false, message: "Password mancante." });
  }

  const collection = req["connessione"]
    .db(DBNAME)
    .collection("schemaOperatori");
  const admin = await collection.findOne({ username: "Admin" });

  if (!admin) {
    return res
      .status(404)
      .send({ success: false, message: "Admin non trovato." });
  }

  // Verifica la password (assumendo che sia salvata come hash)
  const bcrypt = require("bcrypt");
  const passwordCorretta = await bcrypt.compare(password, admin.password);

  if (passwordCorretta) {
    res.send({ success: true });
  } else {
    res.status(401).send({ success: false, message: "Password errata." });
  }
});

app.post("/api/resetPassword/:id", async (req: any, res: Response) => {
  const userId = req.params.id;
  const collection = req["connessione"]
    .db(DBNAME)
    .collection("schemaOperatori");

  const user = await collection.findOne({ _id: new ObjectId(userId) });
  if (!user) {
    return res.status(404).send("Utente non trovato.");
  }

  const tempPassword = Math.random().toString(36).slice(-8); // Genera una password temporanea
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(tempPassword, salt);

  await collection.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { password: hashedPassword, resetPassword: true } } // Imposta il flag `resetPassword`
  );

  // Invia l'email con la password temporanea
  sendEmail(
    user.email,
    "Reset Password",
    `La tua nuova password temporanea è: ${tempPassword}`
  );

  res.send({ message: "Password temporanea inviata via email." });
});

app.delete("/api/eliminaAccount/:id", async (req: any, res: Response) => {
  const userId = req.params.id;
  const operatoriCollection = req["connessione"]
    .db(DBNAME)
    .collection("schemaOperatori");
  const perizieCollection = req["connessione"]
    .db(DBNAME)
    .collection("schemaPerizie");

  const user = await operatoriCollection.findOne({ _id: new ObjectId(userId) });
  if (!user) {
    return res.status(404).send("Utente non trovato.");
  }

  // Elimina l'utente
  await operatoriCollection.deleteOne({ _id: new ObjectId(userId) });

  // Elimina le perizie dell'utente
  await perizieCollection.deleteMany({ codOperatore: userId });

  // Invia l'email di notifica
  sendEmail(
    user.email,
    "Account Eliminato",
    "Il tuo account è stato eliminato."
  );

  res.send({ message: "Account eliminato con successo." });
});

app.get("/api/operatoriConPerizie", async (req: any, res: Response) => {
  try {
    const collectionOperatori = req["connessione"]
      .db(DBNAME)
      .collection("schemaOperatori");
    const collectionPerizie = req["connessione"]
      .db(DBNAME)
      .collection("schemaPerizie");

    // Ottieni tutti gli operatori
    const operatori = await collectionOperatori
      .find({ username: { $ne: "Admin" } }) // Escludi l'admin
      .toArray();

    // Conta le perizie per ogni operatore
    const operatoriConPerizie = await Promise.all(
      operatori.map(async (operatore:any) => {
        const count = await collectionPerizie.countDocuments({
          codOperatore: operatore._id.toString(),
        });
        return { ...operatore, nPerizie: count };
      })
    );

    res.send(operatoriConPerizie);
  } catch (err) {
    console.error("Errore durante il recupero degli operatori:", err);
    res.status(500).send("Errore durante il recupero degli operatori.");
  } finally {
    req["connessione"].close();
  }
});

// Add this code before the DEFAULT ROUTE section

// Get reports for the currently authenticated user
app.get("/api/mieperizie", (req: any, res: Response) => {
  try {
    // Get the user ID from the token payload (set by middleware)
    const userId = req["payload"]._id;

    if (!userId) {
      return res.status(400).send("ID utente non trovato nel token.");
    }

    // Query the database for reports created by this user
    const collection = req["connessione"]
      .db(DBNAME)
      .collection("schemaPerizie");
    collection
      .find({ codOperatore: userId })
      .toArray((err: Error, perizie: any) => {
        if (err) {
          console.error("Errore durante il recupero delle perizie:", err);
          res.status(500).send("Errore durante il recupero delle perizie.");
        } else {
          res.send(perizie);
        }
        req["connessione"].close();
      });
  } catch (error) {
    console.error("Errore durante il recupero delle perizie:", error);
    res
      .status(500)
      .send("Si è verificato un errore durante il recupero delle perizie.");
    req["connessione"].close();
  }
});

// Aggiungi questo nuovo endpoint in server.ts

app.post("/api/resetPassword", (req: any, res: Response) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).send("ID utente o nuova password mancanti");
  }

  // Hash della nuova password
  bcrypt.genSalt(10, function (err, salt) {
    if (err) {
      console.error("Errore durante la generazione del salt:", err);
      return res.status(500).send("Errore durante la generazione del salt.");
    }

    bcrypt.hash(newPassword, salt, function (err, hash) {
      if (err) {
        console.error("Errore durante l'hashing della password:", err);
        return res.status(500).send("Errore durante l'hashing della password.");
      }

      try {
        // Aggiorna la password e imposta resetPassword a false
        const collection = req["connessione"]
          .db(DBNAME)
          .collection("schemaOperatori");
        collection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { password: hash, resetPassword: false } },
          function (err:any, result:any) {
            if (err) {
              console.error("Errore durante il reset della password:", err);
              res.status(500).send("Errore durante il reset della password.");
            } else if (result.modifiedCount === 0) {
              res.status(404).send("Utente non trovato.");
            } else {
              res.send({
                success: true,
                message: "Password reimpostata con successo.",
              });
            }
            req["connessione"].close();
          }
        );
      } catch (error) {
        console.error("Errore durante il reset della password:", error);
        res
          .status(500)
          .send("Si è verificato un errore durante il reset della password.");
        req["connessione"].close();
      }
    });
  });
});

/* ********************** (Sezione 4) DEFAULT ROUTE  ************************* */
// Default route
app.use("/", function (req: any, res: any, next: NextFunction) {
  res.status(404);
  if (req.originalUrl.startsWith("/api/")) {
    res.send("Risorsa non trovata");
    req["connessione"].close();
  } else res.send(paginaErrore);
});

// Gestione degli errori
app.use("/", (err: any, req: any, res: any, next: any) => {
  if (req["connessione"]) req["connessione"].close();
  res.status(500);
  res.send("ERRR: " + err.message);
  console.log("SERVER ERROR " + err.stack);
});

bcrypt.genSalt(10, function (err, salt) {
  if (err) {
    console.error("Errore durante la generazione del salt:", err);
    return;
  }
  bcrypt.hash("admin", salt, function (err, hash) {
    if (err) {
      console.error("Errore durante l'hashing della password:", err);
      return;
    }
    console.log("Password hashata:", hash);
  });
});

async function hashPassword() {
  const client = new MongoClient(CONNECTION_STRING as string);
  try {
    await client.connect();
    const db = client.db(DBNAME);
    const collection = db.collection("schemaOperatori");

    // Trova l'utente Admin
    const user = await collection.findOne({ username: "Admin" });
    if (!user) {
      console.log("Utente Admin non trovato.");
      return;
    }

    // Hasha la password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("admin", salt);

    // Aggiorna la password nel database
    await collection.updateOne(
      { username: "Admin" },
      { $set: { password: hashedPassword } }
    );

    console.log("Password hashata e aggiornata correttamente.");
  } catch (err) {
    console.error("Errore durante l'hashing della password:", err);
  } finally {
    await client.close();
  }
}

hashPassword();

function sendEmail(to: string, subject: string, text: string) {
  const transporter = nodemailer.createTransport({
    service: "Gmail", // Puoi usare altri servizi come Outlook, Yahoo, ecc.
    auth: {
      user: process.env.EMAIL_USER, // Email del mittente
      pass: process.env.EMAIL_PASS, // Password del mittente
    },
    tls: {
      rejectUnauthorized: false, // Ignora i certificati autofirmati
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: subject,
    text: text,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Errore durante l'invio dell'email:", error);
    } else {
      console.log("Email inviata:", info.response);
    }
  });
}
