"use strict";

const url = "https://maps.googleapis.com/maps/api";
let mappa;

let commenti = {
  vetCommenti: [],
  index: 0,
};

toastr.options = {
  closeButton: true,
  debug: false,
  newestOnTop: true,
  progressBar: true,
  positionClass: "toast-top-right", // Posizione del toaster
  preventDuplicates: true,
  onclick: null,
  showDuration: "300",
  hideDuration: "1000",
  timeOut: "5000", // Durata della notifica
  extendedTimeOut: "1000",
  showEasing: "swing",
  hideEasing: "linear",
  showMethod: "fadeIn",
  hideMethod: "fadeOut",
};

$(document).ready(function () {
  const token = localStorage.getItem("token");
  if (!token) {
    // Token mancante, reindirizza al login
    console.error("Token mancante, reindirizzamento al login.");
    window.location.href = "login.html";
  } else {
    // Recupera i dati dell'utente
    const request = inviaRichiesta("GET", "/api/operatore1");
    request.done(function (data) {
      const user = data;
      $("#userName").text(user.username);
      $("#userProfilePic").attr("src", user.img || "img/default-profile.png");
    });

    request.fail(function () {
      console.error("Errore durante il recupero dei dati dell'utente.");
    });
  }

  // Determina la pagina corrente
  const currentPage = window.location.pathname.split("/").pop();

  // Carica la chiave API della mappa
  let request = inviaRichiesta("GET", "/api/MAP_KEY");
  request.fail(errore);
  request.done(function (key) {
    if (!key.key) {
      console.error("Chiave API non ricevuta dal server.");
      return;
    }
    console.log("Chiave API ricevuta:", key.key);
    window.MAP_KEY = key.key; // Salva la chiave API in una variabile globale

    // Inizializza la pagina appropriata
    if (currentPage === "index.html") {
      // Carica le perizie dell'utente per la pagina index.html
      caricaMiePerizie();
    } else {
      // Per userArea.html, carica tutte le perizie
      let perizieRequest = inviaRichiesta("GET", "/api/perizie");
      perizieRequest.fail(errore);
      perizieRequest.done(function (perizie) {
        popolaMappa(perizie);
      });
    }
  });

  // Mostra il modale per creare un nuovo operatore
  $("#btnNuovoOperatore").on("click", function () {
    $("#modalNuovoOperatore").modal("show");
  });

  // Salva il nuovo operatore
  $("#btnSalvaOperatore").on("click", function () {
    let nome = $("#nomeOperatore").val();
    let email = $("#emailOperatore").val();

    if (!nome || !email) {
      toastr.error("Compila tutti i campi!");
      return;
    }

    let request = inviaRichiesta("POST", "/api/nuovoOperatore", {
      nome: nome,
      email: email,
    });

    request.done(function (data) {
      toastr.success("Operatore creato con successo!");
      $("#modalNuovoOperatore").modal("hide");
    });

    request.fail(function (jqXHR, textStatus, errorThrown) {
      console.error(
        "Errore nella creazione dell'operatore:",
        textStatus,
        errorThrown
      );
      toastr.error("Errore nella creazione dell'operatore. Riprova più tardi.");
    });
  });

  // Autocompletamento degli indirizzi con Nominatim
  $("#indirizzo").on("input", function () {
    const query = $(this).val();
    if (query.length < 3) return; // Inizia la ricerca solo dopo 3 caratteri

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}`;

    $.getJSON(url, function (data) {
      const suggestions = data.map((item) => ({
        label: item.display_name,
        value: item.display_name,
        lat: item.lat,
        lon: item.lon,
      }));

      // Mostra i suggerimenti in un elenco
      const suggestionList = $("#suggestionList");
      suggestionList.empty();
      suggestions.forEach((suggestion) => {
        const listItem = $("<li>")
          .addClass("list-group-item")
          .text(suggestion.label)
          .on("click", function () {
            $("#indirizzo").val(suggestion.value);
            $("#indirizzo").data("lat", suggestion.lat);
            $("#indirizzo").data("lon", suggestion.lon);
            suggestionList.empty(); // Nascondi i suggerimenti
          });
        suggestionList.append(listItem);
      });
    }).fail(function () {
      console.error("Errore durante la richiesta a Nominatim.");
    });
  });

  // Aggiungi nuova perizia
  // Aggiorna la parte di gestione del bottone di aggiunta perizia

  $("#btnAggiungiPerizia").on("click", function () {
    const descrizione = $("#descrizione").val();
    const indirizzo = $("#indirizzo").val();

    if (!descrizione || !indirizzo) {
      toastr.error("Compila tutti i campi richiesti!");
      return;
    }

    // Ottieni tutti i file e i relativi commenti
    const files = Array.from($("#foto")[0].files);
    if (files.length === 0) {
      toastr.error("Devi aggiungere almeno una foto!");
      return;
    }

    // Mostra toast di caricamento
    const loadingToast = toastr.info(
      '<i class="fas fa-spinner fa-spin mr-2"></i>Caricamento in corso...',
      null,
      {
        timeOut: 0,
        extendedTimeOut: 0,
        closeButton: false,
        tapToDismiss: false,
      }
    );

    // Disabilita il pulsante durante il caricamento
    $(this)
      .prop("disabled", true)
      .html('<i class="fas fa-spinner fa-spin mr-2"></i> Salvataggio...');

    // Carica tutte le immagini con i loro commenti
    const fotoPromises = files.map((file, index) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
          // Ottieni il commento dal rispettivo textarea
          const commento = $(`#commentoFoto${index}`).val() || "";
          resolve({ img: e.target.result, commento: commento });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    // Quando tutte le foto sono state caricate
    Promise.all(fotoPromises)
      .then((fotoCaricate) => {
        // Invia la richiesta al server
        const request = inviaRichiesta("POST", "/api/nuovaPerizia", {
          descrizione: descrizione,
          indirizzo: indirizzo,
          foto: fotoCaricate,
        });

        request.done(function () {
          // Chiudi il toast di caricamento e mostra il successo
          toastr.clear(loadingToast);
          toastr.success("Perizia aggiunta con successo!");

          // Ricarica la pagina dopo un breve ritardo
          setTimeout(function () {
            location.reload();
          }, 1500);
        });

        request.fail(function (jqXHR) {
          // Gestione errori
          toastr.clear(loadingToast);
          $("#btnAggiungiPerizia")
            .prop("disabled", false)
            .html('<i class="fas fa-save mr-2"></i> Salva perizia');
          toastr.error(
            jqXHR.responseText || "Errore durante l'aggiunta della perizia."
          );
        });
      })
      .catch((err) => {
        // Gestione errori di caricamento delle immagini
        toastr.clear(loadingToast);
        $("#btnAggiungiPerizia")
          .prop("disabled", false)
          .html('<i class="fas fa-save mr-2"></i> Salva perizia');
        console.error("Errore durante il caricamento delle immagini:", err);
        toastr.error("Errore durante il caricamento delle immagini.");
      });
  });

  // Aggiungi campi per i commenti delle foto
  $("#foto").on("change", function () {
    const files = Array.from(this.files);
    const container = $("#fotoCommentiContainer");
    container.empty();
    files.forEach((file, index) => {
      container.append(`
        <div class="form-group mt-3">
          <label for="commentoFoto${index}">Commento per ${file.name}</label>
          <textarea id="commentoFoto${index}" class="form-control"></textarea>
        </div>
      `);
    });
  });

  // Recupera i dati dell'utente
  let requestUser = inviaRichiesta("GET", "/api/operatore1");
  requestUser.done(function (data) {
    let user = data;
    $("#userName").text(user.username);
    $("#userProfilePic").attr("src", user.img || "img/default-profile.png");
  });

  // Cambia foto profilo
  $("#btnChangeProfilePic").on("click", function () {
    let fileInput = $("<input>").attr("type", "file").attr("accept", "image/*");
    fileInput.on("change", function () {
      let file = fileInput[0].files[0];
      let reader = new FileReader();
      reader.onload = function (e) {
        let imgData = e.target.result; // Immagine in formato base64
        let request = inviaRichiesta("POST", "/api/updateOperatore", {
          img: imgData,
        });

        request.done(function (data) {
          toastr.success("Foto profilo aggiornata con successo!");
          $("#userProfilePic").attr("src", data.img); // Aggiorna l'immagine nel frontend
        });

        request.fail(function (jqXHR) {
          console.error(
            "Errore durante l'aggiornamento della foto profilo:",
            jqXHR
          );
          toastr.error("Errore durante l'aggiornamento della foto profilo.");
        });
      };
      reader.readAsDataURL(file); // Converte il file in base64
    });
    fileInput.click();
  });

  // Logout
  $("#btnLogout").on("click", function () {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    window.location.href = "login.html";
  });

  // Elimina account
  $("#btnDeleteAccount").on("click", function () {
    if (confirm("Sei sicuro di voler eliminare il tuo account?")) {
      let request = inviaRichiesta("DELETE", "/api/deleteAccount");
      request.done(function () {
        toastr.success("Account eliminato con successo.");
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        window.location.href = "login.html";
      });
      request.fail(function () {
        toastr.error("Errore durante l'eliminazione dell'account.");
      });
    }
  });

  // Gestione delle sezioni
  $(".nav-link").on("click", function () {
    $(".nav-link").removeClass("active");
    $(this).addClass("active");

    $(".section").removeClass("active");
    if ($(this).attr("id") === "tab-gestione-utenti") {
      $("#gestione-utenti").addClass("active");
      $("#btnToggleFilters").hide(); // Nascondi il bottone "Filtri"
    } else {
      $("#mappa").addClass("active");
      $("#btnToggleFilters").show(); // Mostra il bottone "Filtri"
      $("#btnToggleFilters").html(
        '<i class="fas fa-filter"></i> Mostra Filtri'
      );
      $("#filter").hide(); // Assicurati che il pannello filtri sia nascosto
    }
  });

  // Mostra/Nascondi il form di creazione utente
  $("#btn-apri-form").on("click", function () {
    $("#form-creazione-utente").slideToggle();
  });

  // Creazione di un nuovo utente
  $("#btn-crea-utente").on("click", function () {
    const nome = $("#nome").val();
    const email = $("#email").val();
    const ruolo = $("#ruolo").val();

    if (!nome || !email) {
      toastr.error("Compila tutti i campi!");
      return;
    }

    const request = inviaRichiesta("POST", "/api/nuovoOperatore", {
      nome,
      email,
      ruolo,
    });

    request.done(function () {
      toastr.success("Utente creato con successo!");
      caricaUtenti();
    });

    request.fail(function () {
      toastr.error("Errore durante la creazione dell'utente.");
    });
  });

  // Carica gli utenti nella tabella
  function caricaUtenti() {
    const request = inviaRichiesta("GET", "/api/operatori");
    request.done(function (utenti) {
      const tbody = $("#tabella-utenti");
      tbody.empty();
      utenti
        .filter((utente) => utente.username !== "admin") // Escludi l'admin
        .forEach((utente) => {
          tbody.append(`
            <tr data-id="${utente._id}">
              <td>${utente.username}</td>
              <td>${utente.email}</td>
              <td>${utente.ruolo || "user"}</td>
              <td>
                <button class="btn btn-info btn-sm btn-visualizza-perizie" data-id="${
                  utente._id
                }">
                  <i class="fas fa-map-marker-alt"></i> Visualizza Perizie
                </button>
                <button class="btn btn-warning btn-sm btn-reset-password" data-id="${
                  utente._id
                }">
                  <i class="fas fa-key"></i> Reset Password
                </button>
                <button class="btn btn-danger btn-sm btn-elimina-account" data-id="${
                  utente._id
                }">
                  <i class="fas fa-trash"></i> Elimina Account
                </button>
              </td>
            </tr>
          `);
        });

      // Gestione del click su "Visualizza Perizie"
      $(".btn-visualizza-perizie").on("click", function () {
        const operatoreId = $(this).data("id");
        visualizzaPerizieOperatore(operatoreId);
      });

      // Gestione del click su "Visualizza Perizie"
      $(".btn-visualizza-perizie").on("click", function () {
        const operatoreId = $(this).data("id");
        visualizzaPerizieOperatore(operatoreId);
      });

      // Gestione del click su "Reset Password"
      $(".btn-reset-password").on("click", function () {
        const userId = $(this).data("id");
        resetPassword(userId); // Chiama la funzione per resettare la password
      });

      // Gestione del click su "Elimina Account"
      $(".btn-elimina-account").on("click", function () {
        const userId = $(this).data("id");
        eliminaAccount(userId); // Chiama la funzione per eliminare l'account
      });
    });
  }

  // Carica le perizie nella mappa e nella tabella
  function caricaPerizie(operatoreId = null) {
    console.log("Caricamento perizie per operatore:", operatoreId);

    // Passa alla sezione "Mappa" per consistenza
    $("#tab-mappa").click();

    // Usa l'URL con query string invece di un oggetto per i parametri
    const url = operatoreId
      ? `/api/perizie?operatoreId=${operatoreId}`
      : "/api/perizie";
    const request = inviaRichiesta("GET", url);

    request.done(function (perizie) {
      console.log("Perizie caricate:", perizie.length);

      // Ottieni gli operatori per aggiungere i nomi
      const operatoriRequest = inviaRichiesta("GET", "/api/operatori");
      operatoriRequest.done(function (operatori) {
        const tbody = $("#tabella-perizie");
        tbody.empty();

        perizie.forEach((perizia) => {
          const operatore = operatori.find(
            (op) => op._id === perizia.codOperatore
          );
          const operatoreNome = operatore ? operatore.username : "Sconosciuto";

          tbody.append(`
            <tr data-id="${perizia._id}" class="perizia-row">
              <td>${operatoreNome}</td>
              <td class="col-descrizione">${perizia.descrizione}</td>
              <td>${new Date(perizia["data-ora"]).toLocaleString()}</td>
              <td class="text-center">
                <button class="btn btn-warning btn-sm mr-2 btn-modifica-perizia" data-id="${
                  perizia._id
                }">
                  <i class="fas fa-edit"></i> Modifica
                </button>
                <button class="btn btn-danger btn-sm btn-elimina-perizia" data-id="${
                  perizia._id
                }">
                  <i class="fas fa-trash"></i> Elimina
                </button>
              </td>
            </tr>
          `);
        });

        // Aggiungi eventi per i pulsanti nella tabella
        $(".btn-modifica-perizia").on("click", function () {
          const periziaId = $(this).data("id");
          visualizzaDettagli(periziaId);
        });

        $(".btn-elimina-perizia").on("click", function () {
          const periziaId = $(this).data("id");
          eliminaPerizia(periziaId);
        });

        // Popola la mappa
        popolaMappa(perizie);
      });
    });

    request.fail(function () {
      toastr.error("Errore durante il caricamento delle perizie.");
    });
  }

  // Inizializzazione
  caricaUtenti();
  visualizzaPerizieOperatore(null); // Usa questa funzione invece di caricaPerizie()
  caricaFiltroOperatori();

  // Gestione del click sul bottone "Filtri"
  $("#btnToggleFilters").on("click", function () {
    const filterSection = $("#filter");
    if (filterSection.is(":visible")) {
      filterSection.fadeOut(300); // Nascondi i filtri con animazione
      $(this).html('<i class="fas fa-filter"></i> Mostra Filtri');
    } else {
      filterSection.fadeIn(300); // Mostra i filtri con animazione
      $(this).html('<i class="fas fa-times"></i> Nascondi Filtri');
      caricaFiltroOperatori(); // Popola i filtri
    }
  });

  // Carica le perizie dell'utente (solo per index.html)
  if (currentPage === "index.html") {
    // Gestisci salvataggio modifiche
    $("#salva-modifiche-perizia").on("click", function () {
      const periziaId = $(this).data("id");
      const descrizione = $("#dettaglio-descrizione").val();
      const commentoFoto = $("#dettaglio-commento").val();
      const indexFoto = $("#carousel-foto .carousel-item.active").index();

      // Mostra toast di caricamento
      const loadingToast = toastr.info(
        '<i class="fas fa-spinner fa-spin mr-2"></i>Salvataggio in corso...',
        null,
        {
          timeOut: 0,
          extendedTimeOut: 0,
          closeButton: false,
          tapToDismiss: false,
        }
      );

      // Prima aggiorna la descrizione della perizia
      const requestDescrizione = inviaRichiesta(
        "PUT",
        `/api/perizie/${periziaId}`,
        {
          descrizione: descrizione,
        }
      );

      requestDescrizione.done(function () {
        // Poi aggiorna il commento della foto corrente
        const requestCommento = inviaRichiesta(
          "PUT",
          `/api/perizie/${periziaId}/commento`,
          {
            fotoIndex: indexFoto,
            commento: commentoFoto,
          }
        );

        requestCommento.done(function () {
          // Chiudi il toast di caricamento
          toastr.clear(loadingToast);
          toastr.success("Modifiche salvate con successo!");

          // Chiudi il modale dopo un breve ritardo
          setTimeout(function () {
            $("#modalDettagliPerizia").modal("hide");
            // Ricarica le perizie per mostrare i dati aggiornati
            caricaMiePerizie();
          }, 1000);
        });

        requestCommento.fail(function (jqXHR) {
          toastr.clear(loadingToast);
          console.error("Errore durante l'aggiornamento del commento:", jqXHR);
          toastr.error(
            "Errore durante l'aggiornamento del commento della foto."
          );
        });
      });

      requestDescrizione.fail(function (jqXHR) {
        toastr.clear(loadingToast);
        console.error(
          "Errore durante l'aggiornamento della descrizione:",
          jqXHR
        );
        toastr.error("Errore durante l'aggiornamento della descrizione.");
      });
    });

    // Gestisci eliminazione perizia
    $("#conferma-cancellazione").on("click", function () {
      const periziaId = $(this).data("id");

      const request = inviaRichiesta("DELETE", `/api/perizie/${periziaId}`);

      request.done(function () {
        toastr.success("Perizia eliminata con successo!");
        $("#modalConfermaCancellazione").modal("hide");
        caricaMiePerizie(); // Ricarica le perizie
      });

      request.fail(function () {
        toastr.error("Errore durante l'eliminazione della perizia.");
      });
    });
  }
});

function documentReady() {
  $("#perizia").hide();
  $("#newUser").hide();
  hideFilter();
  let request = inviaRichiesta("GET", "/api/perizie");
  request.fail(errore);
  request.done(function (perizie) {
    popolaMappa(perizie);
  });
  $("#btnFilter").on("click", function () {
    showFilter();
    let request = inviaRichiesta("GET", "/api/operatori");
    request.fail(errore);
    request.done(function (operatori) {
      popolaOperatori(operatori);
    });
  });

  $("#btnHome").on("click", function () {
    $("#perizia").hide();
    $("#newUser").hide();
    $("#home").show();
  });

  $("#btnNewUser").on("click", function () {
    $("#home").hide();
    $("#perizia").hide();
    $("#newUser").show();
    $("#lblSuccess").hide();
  });

  $("#btnEmploy").on("click", function () {
    let name = $("#newNameEmployer").val();
    let mail = $("#newMailEmployer").val();
    let request = inviaRichiesta("POST", "/api/employ", { mail, name });
    request.fail(errore);
    request.done(function (data) {
      $("#lblSuccess").show();
    });
  });

  /**** carousel management *****/
  $(".carousel-control-prev").on("click", function () {
    commenti.vetCommenti[commenti.index] = $(
      "#exampleFormControlTextarea2"
    ).val();
    if (commenti.index == 0) commenti.index = commenti.vetCommenti.length - 1;
    else commenti.index--;
    $("#exampleFormControlTextarea2").val(commenti.vetCommenti[commenti.index]);
    console.log(commenti.vetCommenti);
  });

  $(".carousel-control-next").on("click", function () {
    commenti.vetCommenti[commenti.index] = $(
      "#exampleFormControlTextarea2"
    ).val();
    if (commenti.index == commenti.vetCommenti.length - 1) commenti.index = 0;
    else commenti.index++;
    $("#exampleFormControlTextarea2").val(commenti.vetCommenti[commenti.index]);
    console.log(commenti.vetCommenti);
  });

  $("#commentCarousel")
    .children("button")
    .eq(0)
    .on("click", function () {
      let descrizione = $("#exampleFormControlTextarea1").val();

      commenti.vetCommenti[commenti.index] = $(
        "#exampleFormControlTextarea2"
      ).val();

      let foto = [];
      let imgs = $("#carouselExampleControls").find("img");
      for (let i = 0; i < commenti.vetCommenti.length; i++) {
        let record = {
          img: imgs.eq(i).prop("src"),
          commento: commenti.vetCommenti[i++],
        };
        foto.push(record);
      }

      let request = inviaRichiesta("POST", "/api/aggiornaPerizia", {
        descrizione,
        foto: JSON.stringify(foto),
        id: $(this).prop("id"),
      });
      request.fail(errore);
      request.done(function (data) {
        $("#perizia").hide();
        $("#home").show();
      });
    });
}

function popolaPerizia(perizia) {
  let divperizia = $("#dettagliPerizia");
  let requestOperatore = inviaRichiesta("GET", "/api/operatore", {
    _id: perizia.codOperatore,
  });
  requestOperatore.fail(errore);
  requestOperatore.done(function (operatore) {
    operatore = operatore[0];
    divperizia.children("img").eq(0).attr("src", operatore['"img"']);
    divperizia.children("h3").eq(0).text(operatore.username);

    let date = new Date(perizia["data-ora"]);
    let dataFormattata =
      date.toLocaleDateString() + " " + date.toLocaleTimeString();
    divperizia.children("h4").eq(0).text(dataFormattata);

    divperizia.children("h4").eq(1).text(getIndirizzo(perizia.coordinate));

    divperizia.find("textarea").eq(0).text(perizia.descrizione);

    commenti.vetCommenti = [];
    commenti.index = 0;
    for (const img of perizia.foto) {
      let div = $("<div>");
      div.addClass("carousel-item");
      let imgTag = $("<img>");
      imgTag.addClass("d-block w-100");
      imgTag.prop("src", img.img);
      div.append(imgTag);
      $("#carouselExampleControls").children("div").append(div);
      commenti.vetCommenti.push(img.commento);
    }
    $("#carouselExampleControls")
      .children("div")
      .children("div")
      .eq(0)
      .addClass("active");
    $("#exampleFormControlTextarea2")
      .eq(0)
      .text(commenti.vetCommenti[commenti.index]);
  });

  $("#commentCarousel").children("button").eq(0).prop("id", perizia._id);
}

function popolaOperatori(operatori) {
  console.log(operatori);
  $("#filter").children("ul").eq(0).empty();
  let li = $("<li>");
  li.addClass(
    "list-group-item d-flex justify-content-between align-items-center"
  );
  li.css("cursor", "pointer");
  li.text("All");
  li.on("click", function () {
    let request = inviaRichiesta("GET", "/api/perizie");
    request.fail(errore);
    request.done(function (perizie) {
      console.log(perizie);
      popolaMappa(perizie);
    });
    hideFilter();
  });
  $("#filter").children("ul").eq(0).append(li);

  let length = operatori.length;
  if (operatori.length > 15) {
    length = 15;
  }
  for (let index = 0; index < length; index++) {
    const operatore = operatori[index];
    let li = $("<li>");
    li.addClass(
      "list-group-item d-flex justify-content-between align-items-center"
    );
    li.css("cursor", "pointer");
    li.text(operatore.nome);
    li.on("click", function () {
      console.log(operatore._id);
      let request = inviaRichiesta("GET", "/api/perizieUtente", {
        codOperatore: operatore._id,
      });
      request.fail(errore);
      request.done(function (perizie) {
        console.log(perizie);
        popolaMappa(perizie);
      });
      hideFilter();
    });
    let span = $("<span>");
    span.addClass("badge badge-success badge-pill");
    span.text(operatore.nPerizie);
    li.append(span);
    $("#filter").children("ul").eq(0).append(li);
  }
}

function caricaFiltroOperatori() {
  const request = inviaRichiesta("GET", "/api/operatoriConPerizie");
  request.done(function (operatori) {
    const filterList = $("#filter .filter-list");
    filterList.empty(); // Svuota la lista dei filtri

    // Aggiungi l'opzione "Tutti"
    const allItem = $("<li>")
      .addClass(
        "list-group-item d-flex justify-content-between align-items-center"
      )
      .css({
        cursor: "pointer",
        background: "rgba(30, 30, 47, 0.7)",
        color: "#e0e0e0",
        border: "1px solid rgba(60, 60, 80, 0.3)",
        margin: "4px 0",
        borderRadius: "6px",
        transition: "all 0.2s ease",
      })
      .html('<i class="fas fa-globe mr-2"></i> Tutti gli operatori')
      .hover(
        function () {
          $(this).css("background", "rgba(50, 50, 70, 0.7)");
        },
        function () {
          $(this).css("background", "rgba(30, 30, 47, 0.7)");
        }
      )
      .on("click", function () {
        console.log("Filtra: Tutti gli operatori");
        // Usa visualizzaPerizieOperatore con null per garantire un comportamento uniforme
        visualizzaPerizieOperatore(null);
        $("#filter").fadeOut(300);
      });

    filterList.append(allItem);

    // Aggiungi un filtro per ogni operatore
    operatori.forEach((operatore) => {
      const listItem = $("<li>")
        .addClass(
          "list-group-item d-flex justify-content-between align-items-center"
        )
        .css({
          cursor: "pointer",
          background: "rgba(30, 30, 47, 0.7)",
          color: "#e0e0e0",
          border: "1px solid rgba(60, 60, 80, 0.3)",
          margin: "4px 0",
          borderRadius: "6px",
          transition: "all 0.2s ease",
        })
        .html(`<i class="fas fa-user mr-2"></i> ${operatore.username}`)
        .hover(
          function () {
            $(this).css("background", "rgba(50, 50, 70, 0.7)");
          },
          function () {
            $(this).css("background", "rgba(30, 30, 47, 0.7)");
          }
        )
        .on("click", function () {
          console.log(
            "Filtra per operatore:",
            operatore._id,
            operatore.username
          );
          // Usa la funzione visualizzaPerizieOperatore che aggiorna anche il testo del pulsante
          visualizzaPerizieOperatore(operatore._id);
          $("#filter").fadeOut(300); // Nascondi i filtri
        });

      const badge = $("<span>")
        .addClass("badge rounded-pill")
        .css({
          background: "#0dcaf0",
          color: "#000",
          fontWeight: "bold",
          padding: "5px 10px",
        })
        .text(operatore.nPerizie || 0); // Numero di perizie
      listItem.append(badge);

      filterList.append(listItem);
    });
  });

  request.fail(function () {
    toastr.error("Errore durante il caricamento degli operatori.");
  });

  // Aggiungi l'evento per il pulsante di chiusura
  $(".btn-close-filter").on("click", function () {
    $("#filter").fadeOut(300);
  });
}

// Salva la descrizione della perizia
$(document).on("click", "#salvaDescrizione", function () {
  let commento = $("#commentoFoto").val();
  let nuovaDescrizione = $("#descrizionePerizia").val();
  let periziaId = $("#modalDettagli").data("periziaId");

  let request = inviaRichiesta("PUT", `/api/perizie/${periziaId}`, {
    descrizione: nuovaDescrizione,
  });

  request.done(function () {
    toastr.success("Descrizione aggiornata con successo!");

    // Aggiorna il popup del marker
    let marker = markers[periziaId];
    if (marker) {
      let popup = marker.getPopup();

      // Rigenera il contenuto del popup
      let nuovoContenuto = `
        <h3 style="color: darkblue;">Dettagli Perizia</h3>
        <p style="color: darkblue;"><b>Descrizione:</b> ${nuovaDescrizione}</p>
        <p style="color: darkblue;"><b>Commento:</b> ${commento}</p>
        <button id="visuaDettagli" class="btn btn-primary btn-sm visualizza-dettagli" data-id="${periziaId}">
          Visualizza dettagli
        </button>
      `;
      popup.setHTML(nuovoContenuto); // Imposta il nuovo contenuto del popup
    }

    // Aggiorna la tabella delle perizie
    const rigaTabella = $(`#tabella-perizie tr[data-id="${periziaId}"]`);
    if (rigaTabella.length > 0) {
      rigaTabella.find(".col-descrizione").text(nuovaDescrizione);
    }
  });

  request.fail(function (jqXHR, textStatus, errorThrown) {
    console.error(
      "Errore durante l'aggiornamento della descrizione:",
      textStatus,
      errorThrown
    );
    toastr.error("Impossibile aggiornare la descrizione. Riprova più tardi.");
  });
});

function eliminaPerizia(periziaId) {
  // Mostra il modale per la conferma
  $("#modalConfermaEliminazione").modal("show");

  // Gestione del click sul pulsante "Conferma Eliminazione"
  $("#confermaEliminazione")
    .off("click")
    .on("click", function () {
      const password = $("#passwordAdmin").val();

      if (!password) {
        toastr.error("Inserisci la password dell'admin.");
        return;
      }

      // Verifica la password dell'admin
      const verificaRequest = inviaRichiesta(
        "POST",
        "/api/verificaPasswordAdmin",
        {
          password: password,
        }
      );

      verificaRequest.done(function (response) {
        if (response.success) {
          // Procedi con l'eliminazione della perizia
          const request = inviaRichiesta("DELETE", `/api/perizie/${periziaId}`);
          request.done(function () {
            toastr.success("Perizia eliminata con successo!");

            // Rimuovi la riga dalla tabella
            $(`#tabella-perizie tr[data-id="${periziaId}"]`).remove();

            // Rimuovi il marker dalla mappa
            if (markers[periziaId]) {
              markers[periziaId].remove();
              delete markers[periziaId];
            }

            // Chiudi il modale
            $("#modalConfermaEliminazione").modal("hide");
          });

          request.fail(function () {
            toastr.error("Errore durante l'eliminazione della perizia.");
          });
        } else {
          toastr.error("Password admin errata. Operazione annullata.");
        }
      });

      verificaRequest.fail(function () {
        toastr.error("Errore durante la verifica della password.");
      });
    });
}

function resetPassword(userId) {
  const request = inviaRichiesta("POST", `/api/resetPassword/${userId}`);
  request.done(function () {
    toastr.success("Password temporanea inviata via email.");
  });

  request.fail(function () {
    toastr.error("Errore durante il reset della password.");
  });
}

function eliminaAccount(userId) {
  // Mostra il modale per la conferma
  $("#modalConfermaEliminazioneAccount").modal("show");

  // Gestione del click sul pulsante "Conferma Eliminazione"
  $("#confermaEliminazioneAccount")
    .off("click")
    .on("click", function () {
      const password = $("#passwordAdminAccount").val();

      if (!password) {
        toastr.error("Inserisci la password dell'admin.");
        return;
      }

      // Verifica la password dell'admin
      const verificaRequest = inviaRichiesta(
        "POST",
        "/api/verificaPasswordAdmin",
        {
          password: password,
        }
      );

      verificaRequest.done(function (response) {
        if (response.success) {
          // Procedi con l'eliminazione dell'account
          const request = inviaRichiesta(
            "DELETE",
            `/api/eliminaAccount/${userId}`
          );
          request.done(function () {
            toastr.success("Account eliminato con successo.");

            // Rimuovi l'utente dalla tabella
            $(`#tabella-utenti tr[data-id="${userId}"]`).remove();

            // Ricarica la tabella delle perizie
            caricaPerizie();

            // Chiudi il modale
            $("#modalConfermaEliminazioneAccount").modal("hide");
          });

          request.fail(function () {
            toastr.error("Errore durante l'eliminazione dell'account.");
          });
        } else {
          toastr.error("Password admin errata. Operazione annullata.");
        }
      });

      verificaRequest.fail(function () {
        toastr.error("Errore durante la verifica della password.");
      });
    });
}

function visualizzaPerizieOperatore(operatoreId = null) {
  console.log("Operatore ID passato al backend:", operatoreId);

  // Passa alla sezione "Mappa"
  $("#tab-mappa").click();

  // Nascondi il badge di reset se stiamo visualizzando tutte le perizie
  if (!operatoreId) {
    $("#resetFiltro").remove();
    $("#btnToggleFilters").html('<i class="fas fa-filter"></i> Filtri');
  }

  // URL con o senza parametro operatoreId
  const url = operatoreId
    ? `/api/perizie?operatoreId=${operatoreId}`
    : "/api/perizie";

  const request = inviaRichiesta("GET", url);
  request.done(function (perizie) {
    console.log("Perizie ricevute dal backend:", perizie.length);

    // Ottieni gli operatori per aggiungere i nomi
    const operatoriRequest = inviaRichiesta("GET", "/api/operatori");
    operatoriRequest.done(function (operatori) {
      const tbody = $("#tabella-perizie");
      tbody.empty();

      // Se abbiamo un operatoreId, aggiorna il testo del pulsante "Filtri"
      if (operatoreId) {
        const operatore = operatori.find((op) => op._id === operatoreId);
        if (operatore) {
          // Aggiorna il testo del pulsante con il nome dell'operatore
          $("#btnToggleFilters").html(
            `<i class="fas fa-filter"></i> Filtro: ${operatore.username}`
          );

          // Aggiungi il badge per resettare il filtro se non esiste già
          if ($("#resetFiltro").length === 0) {
            const resetBadge = $("<span>")
              .attr("id", "resetFiltro")
              .addClass("badge badge-pill badge-warning ml-2")
              .css({
                cursor: "pointer",
                padding: "5px 10px",
                fontSize: "0.8rem",
              })
              .html('<i class="fas fa-times"></i> Rimuovi filtro')
              .on("click", function () {
                visualizzaPerizieOperatore(null); // Rimuovi il filtro
              });

            $("#btnToggleFilters").after(resetBadge);
          }
        }
      }

      // Popola la tabella delle perizie
      perizie.forEach((perizia) => {
        const operatore = operatori.find(
          (op) => op._id === perizia.codOperatore
        );
        const operatoreNome = operatore ? operatore.username : "Sconosciuto";

        tbody.append(`
          <tr data-id="${perizia._id}" class="perizia-row">
            <td>${operatoreNome}</td>
            <td class="col-descrizione">${perizia.descrizione}</td>
            <td>${new Date(perizia["data-ora"]).toLocaleString()}</td>
            <td class="text-center">
              <button class="btn btn-warning btn-sm btn-modifica-perizia" data-id="${
                perizia._id
              }">
                <i class="fas fa-edit"></i> Modifica
              </button>
              <button class="btn btn-danger btn-sm btn-elimina-perizia" data-id="${
                perizia._id
              }">
                <i class="fas fa-trash"></i> Elimina
              </button>
            </td>
          </tr>
        `);
      });

      // Aggiungi eventi per i pulsanti nella tabella
      $(".btn-modifica-perizia").on("click", function () {
        const periziaId = $(this).data("id");
        visualizzaDettagli(periziaId);
      });

      $(".btn-elimina-perizia").on("click", function () {
        const periziaId = $(this).data("id");
        eliminaPerizia(periziaId);
      });

      // Popola la mappa con le perizie filtrate (questa funzione ora contiene la logica di zoom automatico)
      popolaMappa(perizie);
    });
  });

  request.fail(function () {
    toastr.error("Errore durante il caricamento delle perizie.");
  });
}

// Funzioni per index.html - Perizie dell'utente
function caricaMiePerizie() {
  const request = inviaRichiesta("GET", "/api/mieperizie");

  request.done(function (perizie) {
    // Popola la mappa con zoom automatico
    popolaMappaMiePerizie(perizie);

    // Popola la tabella
    const tbody = $("#tabella-mie-perizie");
    tbody.empty();

    perizie.forEach((perizia) => {
      tbody.append(`
        <tr class="perizia-row">
          <td>${new Date(perizia["data-ora"]).toLocaleString()}</td>
          <td class="text-truncate" style="max-width: 150px;">${
            perizia.descrizione
          }</td>
          <td class="text-center">
            <button class="btn btn-info btn-sm btn-action visualizza-perizia" data-id="${
              perizia._id
            }">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-warning btn-sm btn-action modifica-perizia" data-id="${
              perizia._id
            }">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-action elimina-perizia" data-id="${
              perizia._id
            }">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `);
    });

    // Gestione eventi pulsanti
    $(".visualizza-perizia").on("click", function () {
      const periziaId = $(this).data("id");
      visualizzaDettagliPerizia(periziaId, false); // Solo visualizzazione
    });

    $(".modifica-perizia").on("click", function () {
      const periziaId = $(this).data("id");
      visualizzaDettagliPerizia(periziaId, true); // Modalità modifica
    });

    $(".elimina-perizia").on("click", function () {
      const periziaId = $(this).data("id");
      $("#modalConfermaCancellazione").modal("show");
      $("#conferma-cancellazione").data("id", periziaId);
    });
  });

  request.fail(function () {
    toastr.error("Errore durante il caricamento delle perizie.");
  });
}

// Replace the popolaMappaMiePerizie function with this updated version

function popolaMappaMiePerizie(perizie) {
  if (typeof maplibregl === "undefined") {
    console.error("MapLibre GL non è stato caricato");
    return;
  }

  const map = new maplibregl.Map({
    container: "map-container",
    style: `https://api.maptiler.com/maps/streets/style.json?key=${MAP_KEY}`,
    center: [7.85, 44.69], // Coordinate sede centrale (same as userArea.html)
    zoom: 13, // Higher zoom level to match userArea.html
  });
  const perizieCoordinates = [];
  // Aggiungi marker per la sede centrale (blu)
  new maplibregl.Marker({ color: "blue" })
    .setLngLat([7.85, 44.69])
    .setPopup(
      new maplibregl.Popup().setHTML(
        '<h3 style="color: darkblue;">Sede Centrale</h3>'
      )
    )
    .addTo(map);

  // Aggiungi marker per ogni perizia
  perizie.forEach((perizia) => {
    if (perizia.coordinate) {
      const coordinates = [perizia.coordinate.longitude, perizia.coordinate.latitude];
      perizieCoordinates.push(coordinates);
      const marker = new maplibregl.Marker()
        .setLngLat([perizia.coordinate.longitude, perizia.coordinate.latitude])
        .setPopup(
          new maplibregl.Popup().setHTML(`
            <h3 style="color: darkblue;">Perizia</h3>
            <p style="color: darkblue;"><b>Data:</b> ${new Date(
              perizia["data-ora"]
            ).toLocaleDateString()}</p>
            <p style="color: darkblue;"><b>Descrizione:</b> ${
              perizia.descrizione
            }</p>
            <button class="btn btn-sm btn-primary view-details" data-id="${
              perizia._id
            }">Dettagli</button>
          `)
        )
        .addTo(map);
    }
  });
  map.on('load', function() {
    // Aggiungi un piccolo ritardo per assicurarti che la mappa sia completamente caricata
    setTimeout(() => {
      fitMapToPerizieCoordinates(map, perizieCoordinates);
    }, 200);
  });
  // Event handler for popup "Dettagli" button - should open the same modal as table buttons
  map.on("click", ".view-details", function (e) {
    const periziaId = $(this).data("id");
    visualizzaDettagliPerizia(periziaId, false); // Open in view mode, not edit mode
    e.preventDefault(); // Prevent the popup from closing
  });
}

// Add this function to make marker popup buttons work

// Add this after the map.on('click') in popolaMappaMiePerizie
$(document).on("click", ".maplibregl-popup .view-details", function (e) {
  e.preventDefault();
  e.stopPropagation();
  const periziaId = $(this).data("id");
  visualizzaDettagliPerizia(periziaId, false);
});

// Visualizza o modifica i dettagli di una perizia
function visualizzaDettagliPerizia(periziaId, editMode = false) {
  const request = inviaRichiesta("GET", `/api/perizie/${periziaId}`);

  request.done(function (perizia) {
    // Compila i dati nel modale (codice esistente)
    $("#dettaglio-data").text(new Date(perizia["data-ora"]).toLocaleString());

    // Gestione indirizzo (codice esistente)
    $("#dettaglio-indirizzo").text("Ricerca indirizzo in corso...");
    if (
      perizia.coordinate &&
      perizia.coordinate.latitude &&
      perizia.coordinate.longitude
    ) {
      coordinateToAddress(
        perizia.coordinate.latitude,
        perizia.coordinate.longitude
      )
        .then((address) => {
          $("#dettaglio-indirizzo").text(address);
        })
        .catch((error) => {
          console.error("Errore nel recupero dell'indirizzo:", error);
          $("#dettaglio-indirizzo").text(
            `Coordinate: ${perizia.coordinate.latitude}, ${perizia.coordinate.longitude}`
          );
        });
    } else if (perizia.indirizzo) {
      $("#dettaglio-indirizzo").text(perizia.indirizzo);
    } else {
      $("#dettaglio-indirizzo").text("Indirizzo non disponibile");
    }

    $("#dettaglio-descrizione").val(perizia.descrizione);

    // Gestione del carousel delle foto (codice esistente)
    const carouselInner = $("#carousel-foto .carousel-inner");
    carouselInner.empty();

    perizia.foto.forEach((foto, index) => {
      carouselInner.append(`
        <div class="carousel-item ${index === 0 ? "active" : ""}">
          <img src="${foto.img}" class="d-block w-100" alt="Foto perizia">
          <div class="carousel-caption d-none d-md-block">
            <h5>Foto ${index + 1}</h5>
          </div>
        </div>
      `);
    });

    // Imposta il commento della prima foto
    if (perizia.foto.length > 0) {
      $("#dettaglio-commento").val(perizia.foto[0].commento || "");
    }

    // Gestisci cambio foto nel carousel per aggiornare il commento
    $("#carousel-foto")
      .off("slid.bs.carousel")
      .on("slid.bs.carousel", function (e) {
        const index = $(this).find(".active").index();
        $("#dettaglio-commento").val(perizia.foto[index].commento || "");
      });

    // Imposta l'ID della perizia per il salvataggio
    $("#salva-modifiche-perizia").data("id", periziaId);

    // Mostra il modale
    $("#modalDettagliPerizia").modal("show");

    // Imposta modalità (visualizzazione o modifica)
    if (!editMode) {
      $("#dettaglio-descrizione").prop("readonly", true);
      $("#dettaglio-commento").prop("readonly", true);
      $("#salva-modifiche-perizia").hide();

      // In modalità visualizzazione, mostra la mappa
      $("#mappa-dettaglio-container").show();

      // Inizializza la mappa con effetto di zoom solo dopo che il modale è stato mostrato completamente
      $("#modalDettagliPerizia").on("shown.bs.modal", function () {
        if (
          perizia.coordinate &&
          perizia.coordinate.latitude &&
          perizia.coordinate.longitude
        ) {
          // Inizializza la mappa con effetto di zoom
          inizializzaMappaDettaglio(perizia);
        } else {
          // Se non ci sono coordinate, nascondi il container della mappa
          $("#mappa-dettaglio-container").hide();
        }
      });
    } else {
      // In modalità modifica, nascondi la mappa
      $("#dettaglio-descrizione").prop("readonly", false);
      $("#dettaglio-commento").prop("readonly", false);
      $("#salva-modifiche-perizia").show();
      $("#mappa-dettaglio-container").hide();
    }
  });

  request.fail(function () {
    toastr.error("Errore nel caricamento dei dettagli della perizia.");
  });
}

// Aggiungi questa funzione per convertire coordinate in indirizzo

/**
 * Funzione che converte coordinate in un indirizzo leggibile
 * Utilizza l'API Nominatim di OpenStreetMap per il reverse geocoding
 */
function coordinateToAddress(latitude, longitude) {
  return new Promise((resolve, reject) => {
    // Costruisci l'URL per la richiesta di reverse geocoding
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

    $.ajax({
      url: url,
      method: "GET",
      headers: {
        // Importante per non violare i termini di servizio di Nominatim
        "User-Agent": "AssicurazioniApp",
      },
      success: function (response) {
        if (response.address) {
          // Estrai solo via, città e provincia
          const street =
            response.address.road ||
            response.address.pedestrian ||
            response.address.street ||
            response.address.path ||
            "";

          const city =
            response.address.city ||
            response.address.town ||
            response.address.village ||
            response.address.hamlet ||
            "";

          const province =
            response.address.state || response.address.county || "";

          // Costruisci l'indirizzo formattato
          let formattedAddress = "";

          if (street) formattedAddress += street;
          if (city) formattedAddress += (formattedAddress ? ", " : "") + city;
          if (province)
            formattedAddress +=
              (formattedAddress ? " (" : "") +
              province +
              (formattedAddress ? ")" : "");

          resolve(formattedAddress || "Indirizzo non trovato");
        } else {
          // Fallback al display_name se l'oggetto address non è strutturato come previsto
          const shortAddress = response.display_name
            ? response.display_name.split(",").slice(0, 3).join(",")
            : "Indirizzo non trovato";

          resolve(shortAddress);
        }
      },
      error: function (error) {
        console.error("Errore nel reverse geocoding:", error);
        reject("Impossibile determinare l'indirizzo");
      },
    });
  });
}

// Nuova funzione per inizializzare la mappa nel modale dei dettagli

/**
 * Inizializza la mappa nel modale dei dettagli con effetto di zoom
 */
function inizializzaMappaDettaglio(perizia) {
  // Controlla se il container della mappa esiste
  if (!document.getElementById("mappa-dettaglio-container")) return;

  // Ottieni le coordinate della perizia
  const coordinates = [
    perizia.coordinate.longitude,
    perizia.coordinate.latitude,
  ];

  // Inizializza la mappa con una vista lontana
  const detailMap = new maplibregl.Map({
    container: "mappa-dettaglio-container",
    style: `https://api.maptiler.com/maps/streets/style.json?key=${MAP_KEY}`,
    center: coordinates,
    zoom: 1, // Inizia da lontano per l'effetto di zoom
  });

  // Aggiungi controlli di navigazione
  detailMap.addControl(
    new maplibregl.NavigationControl({
      showCompass: false,
    }),
    "top-right"
  );

  // Aggiungi un marker per la perizia - SENZA POPUP
  new maplibregl.Marker({
    color: "#FF5252", // Rosso per evidenziare
  })
    .setLngLat(coordinates)
    .addTo(detailMap);

  // Quando la mappa è caricata, esegui l'animazione di zoom
  detailMap.on("load", () => {
    // Esegui l'animazione di zoom dopo un breve ritardo
    setTimeout(() => {
      detailMap.flyTo({
        center: coordinates,
        zoom: 15,
        speed: 0.8, // Velocità dell'animazione
        curve: 1, // Curva dell'animazione
        easing: function (t) {
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        },
        essential: true,
      });
    }, 300);
  });

  // Aggiusta la mappa quando il modale viene ridimensionato
  $(window).on("resize", function () {
    if (detailMap && document.getElementById("mappa-dettaglio-container")) {
      detailMap.resize();
    }
  });
}

// Modifica della funzione visualizzaDettagli per mostrare il carosello di foto

function visualizzaDettagli(periziaId) {
  const request = inviaRichiesta("GET", `/api/perizie/${periziaId}`);

  request.done(function (perizia) {
    $("#modalDettagli").data("periziaId", periziaId);

    // Imposta i dati della perizia
    $("#dataOra").text(new Date(perizia["data-ora"]).toLocaleString());

    // Gestione indirizzo
    if (perizia.coordinate) {
      coordinateToAddress(
        perizia.coordinate.latitude,
        perizia.coordinate.longitude
      )
        .then((address) => {
          $("#indirizzo").text(address);
        })
        .catch(() => {
          $("#indirizzo").text(
            `Coordinate: ${perizia.coordinate.latitude}, ${perizia.coordinate.longitude}`
          );
        });
    } else if (perizia.indirizzo) {
      $("#indirizzo").text(perizia.indirizzo);
    } else {
      $("#indirizzo").text("Indirizzo non disponibile");
    }

    $("#descrizionePerizia").val(perizia.descrizione);

    // Gestione delle foto in un carosello
    const fotoContainer = $("#fotoContainer");
    fotoContainer.empty();

    if (perizia.foto && perizia.foto.length > 0) {
      // Crea il carosello
      const carousel = $(`
        <div id="carouselPeriziaFoto" class="carousel slide" data-ride="carousel">
          <div class="carousel-inner"></div>
          <a class="carousel-control-prev" href="#carouselPeriziaFoto" role="button" data-slide="prev">
            <span class="carousel-control-prev-icon" aria-hidden="true"></span>
            <span class="sr-only">Precedente</span>
          </a>
          <a class="carousel-control-next" href="#carouselPeriziaFoto" role="button" data-slide="next">
            <span class="carousel-control-next-icon" aria-hidden="true"></span>
            <span class="sr-only">Successiva</span>
          </a>
        </div>
      `);

      fotoContainer.append(carousel);
      const carouselInner = carousel.find(".carousel-inner");

      // Aggiungi le foto al carosello
      perizia.foto.forEach((foto, index) => {
        const item = $(`
          <div class="carousel-item ${index === 0 ? "active" : ""}">
            <img src="${
              foto.img
            }" class="d-block w-100" alt="Foto perizia" style="max-height: 400px; object-fit: contain;">
            <div class="carousel-caption d-none d-md-block" style="background: rgba(0,0,0,0.7); border-radius: 5px;">
              <p class="mb-0">Foto ${index + 1}${
          foto.commento ? ": " + foto.commento : ""
        }</p>
            </div>
          </div>
        `);
        carouselInner.append(item);
      });

      // Imposta il commento per la prima foto
      $("#commentoFoto").val(perizia.foto[0].commento || "");

      // Aggiorna il commento quando cambia la foto
      $("#carouselPeriziaFoto").on("slid.bs.carousel", function (e) {
        const activeIndex = $(this).find(".active").index();
        $("#commentoFoto").val(perizia.foto[activeIndex].commento || "");
      });

      // Salva il commento della foto
      $("#salvaCommento")
        .off("click")
        .on("click", function () {
          const activeIndex = $("#carouselPeriziaFoto").find(".active").index();
          const nuovoCommento = $("#commentoFoto").val();

          // Invia la richiesta per aggiornare il commento
          const updateRequest = inviaRichiesta(
            "PUT",
            `/api/perizie/${periziaId}/commento`,
            {
              fotoIndex: activeIndex,
              commento: nuovoCommento,
            }
          );

          updateRequest.done(function () {
            toastr.success("Commento aggiornato con successo!");
            perizia.foto[activeIndex].commento = nuovoCommento; // Aggiorna localmente
          });

          updateRequest.fail(function () {
            toastr.error("Errore durante l'aggiornamento del commento.");
          });
        });
    } else {
      fotoContainer.html('<p class="text-muted">Nessuna foto disponibile</p>');
      $("#commentoFoto").val("").prop("disabled", true);
      $("#salvaCommento").prop("disabled", true);
    }

    // Mostra il modale
    $("#modalDettagli").modal("show");
  });

  request.fail(function () {
    toastr.error("Errore durante il recupero dei dettagli della perizia.");
  });
}

// Aggiungi questo script JavaScript per gestire le foto multiple

// Array per memorizzare tutte le foto selezionate
let selectedFiles = [];

// Inizializza il sistema di upload cumulativo
$(document).ready(function () {
  // Gestione dell'aggiunta di foto
  $("#foto, #btnAggiungiAltri").on("click", function (e) {
    if (this.id === "btnAggiungiAltri") {
      e.preventDefault();
      $("#foto").click();
    }
  });

  // Quando l'utente seleziona nuove foto
  $("#foto").on("change", function () {
    const newFiles = Array.from(this.files);
    if (newFiles.length === 0) return;

    // Aggiungi le nuove foto all'array esistente
    newFiles.forEach((file) => {
      // Verifica se il file è già presente (evita duplicati)
      const isDuplicate = selectedFiles.some(
        (existingFile) =>
          existingFile.name === file.name &&
          existingFile.size === file.size &&
          existingFile.lastModified === file.lastModified
      );

      if (!isDuplicate) {
        // Aggiungi un ID univoco e il commento vuoto
        selectedFiles.push({
          file: file,
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          commento: "",
        });
      }
    });

    // Aggiorna l'anteprima
    refreshFilePreview();

    // Resetta l'input file per permettere di selezionare gli stessi file nuovamente se necessario
    $(this).val("");
  });

  // Pulsante per cancellare tutte le foto
  $("#btnClearFoto").on("click", function () {
    if (confirm("Sei sicuro di voler rimuovere tutte le foto?")) {
      selectedFiles = [];
      refreshFilePreview();
    }
  });

  // Delegazione eventi per rimuovere singole foto e salvare commenti
  $("#foto-preview-row").on("click", ".remove-foto", function () {
    const id = $(this).data("id");
    selectedFiles = selectedFiles.filter((item) => item.id !== id);
    refreshFilePreview();
  });

  // Salva i commenti quando l'utente scrive
  $("#foto-preview-row").on("input", ".foto-commento", function () {
    const id = $(this).data("id");
    const commento = $(this).val();

    // Trova l'elemento corrispondente nell'array e aggiorna il commento
    const fileItem = selectedFiles.find((item) => item.id === id);
    if (fileItem) {
      fileItem.commento = commento;
    }
  });

  // Modifica l'evento click del pulsante di salvataggio perizia
  $("#btnAggiungiPerizia")
    .off("click")
    .on("click", function () {
      const descrizione = $("#descrizione").val();
      const indirizzo = $("#indirizzo").val();

      if (!descrizione || !indirizzo) {
        toastr.error("Compila tutti i campi richiesti!");
        return;
      }

      if (selectedFiles.length === 0) {
        toastr.error("Devi aggiungere almeno una foto!");
        return;
      }

      // Mostra toast di caricamento
      const loadingToast = toastr.info(
        '<i class="fas fa-spinner fa-spin mr-2"></i>Caricamento in corso...',
        null,
        {
          timeOut: 0,
          extendedTimeOut: 0,
          closeButton: false,
          tapToDismiss: false,
        }
      );

      // Disabilita il pulsante durante il caricamento
      $(this)
        .prop("disabled", true)
        .html('<i class="fas fa-spinner fa-spin mr-2"></i> Salvataggio...');

      // Converti tutti i file in base64
      const fotoPromises = selectedFiles.map((item) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = function (e) {
            resolve({
              img: e.target.result,
              commento: item.commento,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(item.file);
        });
      });

      // Quando tutte le foto sono pronte
      Promise.all(fotoPromises)
        .then((fotoCaricate) => {
          console.log(`Caricamento di ${fotoCaricate.length} foto completato`);

          const request = inviaRichiesta("POST", "/api/nuovaPerizia", {
            descrizione: descrizione,
            indirizzo: indirizzo,
            foto: fotoCaricate,
          });

          request.done(function () {
            toastr.clear(loadingToast);
            toastr.success("Perizia aggiunta con successo!");

            setTimeout(function () {
              location.reload();
            }, 1500);
          });

          request.fail(function (jqXHR) {
            toastr.clear(loadingToast);
            $("#btnAggiungiPerizia")
              .prop("disabled", false)
              .html('<i class="fas fa-save mr-2"></i> Salva perizia');

            toastr.error(
              jqXHR.responseText || "Errore durante l'aggiunta della perizia."
            );
          });
        })
        .catch((err) => {
          toastr.clear(loadingToast);
          $("#btnAggiungiPerizia")
            .prop("disabled", false)
            .html('<i class="fas fa-save mr-2"></i> Salva perizia');

          console.error("Errore durante il caricamento delle immagini:", err);
          toastr.error("Errore durante il caricamento delle immagini.");
        });
    });
});

// Funzione per aggiornare l'anteprima delle foto
function refreshFilePreview() {
  const previewRow = $("#foto-preview-row");
  previewRow.empty();

  // Aggiorna il contatore
  $("#contatore-foto").text(`${selectedFiles.length} foto selezionate`);

  // Mostra/nascondi il pulsante di cancellazione
  if (selectedFiles.length > 0) {
    $("#btnClearFoto").show();
  } else {
    $("#btnClearFoto").hide();
  }

  // Crea card per ogni foto
  selectedFiles.forEach((item) => {
    const reader = new FileReader();

    reader.onload = function (e) {
      const card = $(`
        <div class="col-md-6 mb-3">
          <div class="card h-100 foto-card">
            <div class="card-img-top foto-preview-header" style="height: 150px; overflow: hidden; position: relative;">
              <img src="${e.target.result}" class="w-100" style="object-fit: cover; height: 100%;" alt="${item.file.name}">
              <button type="button" class="btn btn-sm btn-danger remove-foto" data-id="${item.id}" 
                style="position: absolute; top: 5px; right: 5px; z-index: 10; border-radius: 50%; width: 25px; height: 25px; padding: 0;">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="card-body p-2">
              <h6 class="card-title text-truncate mb-2" style="font-size: 0.9rem;">
                <i class="fas fa-image mr-1 text-info"></i> ${item.file.name}
              </h6>
              <div class="form-group mb-1">
                <textarea class="form-control form-control-sm foto-commento" data-id="${item.id}" 
                  placeholder="Aggiungi un commento..." rows="2">${item.commento}</textarea>
              </div>
            </div>
          </div>
        </div>
      `);

      previewRow.append(card);
    };

    reader.readAsDataURL(item.file);
  });
}
