"use strict";

let markers = {}; // Oggetto per salvare i marker
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

function popolaMappa(perizie) {
  if (typeof maplibregl === "undefined") {
    console.error("MapLibre GL JS non è stato caricato correttamente.");
    return;
  }

  if (!MAP_KEY) {
    console.error("Chiave API non definita.");
    return;
  }

  // Inizializza la mappa
  let map = new maplibregl.Map({
    container: "map",
    style: `https://api.maptiler.com/maps/streets/style.json?key=${MAP_KEY}`,
    center: [7.85, 44.69], // Centro sulla sede centrale
    zoom: 13,
  });

  // Rimuovi tutti i marker esistenti
  for (const markerId in markers) {
    markers[markerId].remove();
  }
  markers = {}; // Resetta l'oggetto dei marker

  // Aggiungi il segnaposto per la sede centrale
  new maplibregl.Marker({ color: "blue" })
    .setLngLat([7.85, 44.69])
    .setPopup(
      new maplibregl.Popup().setHTML(
        '<h3 style="color: darkblue;">Sede Centrale</h3>'
      )
    )
    .addTo(map);

  // Array per raccogliere tutte le coordinate delle perizie
  const perizieCoordinates = [];

  // Aggiungi i segnaposti per le perizie filtrate
  for (const perizia of perizie) {
    if (
      perizia.coordinate &&
      perizia.coordinate.longitude &&
      perizia.coordinate.latitude
    ) {
      const coordinates = [
        perizia.coordinate.longitude,
        perizia.coordinate.latitude,
      ];
      perizieCoordinates.push(coordinates);

      let marker = new maplibregl.Marker().setLngLat(coordinates).addTo(map);

      // Aggiungi un popup al segnaposto
      let popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        <h3 style="color: darkblue;">Dettagli Perizia</h3>
        <p style="color: darkblue;"><b>Descrizione:</b> ${
          perizia.descrizione
        }</p>
        <p style="color: darkblue;"><b>Commento:</b> ${
          perizia.foto[0]?.commento || "Nessun commento"
        }</p>
        <button id="visuaDettagli" class="btn btn-primary btn-sm visualizza-dettagli" data-id="${
          perizia._id
        }">
        Visualizza dettagli
        </button>
      `);
      marker.setPopup(popup);

      // Salva il marker nell'oggetto markers
      markers[perizia._id] = marker;
    }
  }

  popolaFiltroOperatori(perizie);

  // Dopo aver aggiunto tutti i marker, esegui lo zoom automatico
  map.on("load", function () {
    // Aggiungi un piccolo ritardo per assicurarti che la mappa sia completamente caricata
    setTimeout(() => {
      fitMapToPerizieCoordinates(map, perizieCoordinates);
    }, 200);
  });
}

// Nuova funzione per calcolare lo zoom ottimale per le coordinate delle perizie
function fitMapToPerizieCoordinates(map, coordinates) {
  if (coordinates.length === 0) {
    // Nessuna perizia con coordinate valide
    return;
  }

  if (coordinates.length === 1) {
    // Solo una perizia, zoom direttamente su di essa
    map.flyTo({
      center: coordinates[0],
      zoom: 15,
      duration: 1500,
      essential: true,
    });
    return;
  }

  // Crea un bounds che contenga tutte le perizie
  const bounds = new maplibregl.LngLatBounds();

  // Estendi il bounds per includere tutte le coordinate
  coordinates.forEach((coord) => {
    bounds.extend(coord);
  });

  // Zoom della mappa per mostrare tutte le perizie con un padding
  map.fitBounds(bounds, {
    padding: 100, // Padding attorno al bounds in pixel
    maxZoom: 15, // Limita lo zoom massimo
    duration: 1500, // Durata dell'animazione in ms
    essential: true,
  });
}

// Funzione per visualizzare i dettagli della perizia
function visualizzaDettagli(periziaId) {
  let request = inviaRichiesta("GET", `/api/perizie/${periziaId}`);
  request.done(function (perizia) {
    console.log("Dati perizia ricevuti:", perizia); // Log per debug

    // Popola i campi del modale
    $("#dataOra").text(perizia["data-ora"] || "Data non disponibile");
    $("#descrizionePerizia").val(
      perizia.descrizione || "Descrizione non disponibile"
    );
    $("#commentoFoto").val(
      perizia.foto[0]?.commento || "Nessun commento disponibile"
    );
    $("#modalDettagli").data("periziaId", periziaId);

    // Ottieni l'indirizzo dalle coordinate
    getIndirizzo(perizia.coordinate, function (indirizzo) {
      $("#indirizzo").text(indirizzo || "Indirizzo non disponibile");
    });

    // Mostra le foto
    let fotoContainer = $("#fotoContainer");
    fotoContainer.empty(); // Svuota il contenitore prima di aggiungere nuove foto
    if (perizia.foto && perizia.foto.length > 0) {
      for (const foto of perizia.foto) {
        fotoContainer.append(
          `<img src="${foto.img}" alt="Foto perizia" class="img-thumbnail" style="margin: 5px;">`
        );
      }
    } else {
      fotoContainer.append("<p>Nessuna foto disponibile</p>");
    }

    // Mostra la sezione dei dettagli con animazione
    $("#dettagliPerizia").fadeIn(500);
    $("#modalDettagli").modal("show");
  });

  request.fail(function (jqXHR, textStatus, errorThrown) {
    console.error(
      "Errore nel recupero dei dettagli della perizia:",
      textStatus,
      errorThrown
    );
    alert(
      "Impossibile recuperare i dettagli della perizia. Riprova più tardi."
    );
  });
}

// Funzione per ottenere l'indirizzo dalle coordinate
function getIndirizzo(coordinate, callback) {
  let url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinate.latitude}&lon=${coordinate.longitude}`;
  $.getJSON(url, function (data) {
    if (data && data.display_name) {
      callback(data.display_name);
    } else {
      callback(null);
    }
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

// Salva il commento della foto
$(document).on("click", "#salvaCommento", function () {
  let descrizione = $("#descrizionePerizia").val();
  let nuovoCommento = $("#commentoFoto").val();
  let periziaId = $("#modalDettagli").data("periziaId");

  let request = inviaRichiesta("PUT", `/api/perizieCommento/${periziaId}`, {
    commento: nuovoCommento,
  });

  request.done(function (response) {
    toastr.success(response.message); // Mostra il messaggio restituito dal server

    // Aggiorna il popup del marker
    let marker = markers[periziaId];
    if (marker) {
      let popup = marker.getPopup();

      // Rigenera il contenuto del popup
      let nuovoContenuto = `
        <h3 style="color: darkblue;">Dettagli Perizia</h3>
        <p style="color: darkblue;"><b>Descrizione:</b> ${descrizione}</p>
        <p style="color: darkblue;"><b>Commento:</b> ${nuovoCommento}</p>
        <button id="visuaDettagli" class="btn btn-primary btn-sm visualizza-dettagli" data-id="${periziaId}">
          Visualizza dettagli
        </button>
      `;
      popup.setHTML(nuovoContenuto); // Imposta il nuovo contenuto del popup
    }
  });

  request.fail(function (jqXHR, textStatus, errorThrown) {
    toastr.error("Impossibile aggiornare il commento. Riprova più tardi.");
  });
});

// Event listener per il pulsante "Visualizza dettagli"
$(document).on("click", "#visuaDettagli", function () {
  let periziaId = $(this).data("id"); // Ottieni l'ID della perizia dal pulsante
  visualizzaDettagli(periziaId); // Chiama la funzione con l'ID della perizia
});

function disegnaPercorso(perizia, map) {
  // Esempio di disegno di un percorso (simulato)
  let coordinates = [
    [10.0, 45.0], // Punto di partenza (esempio)
    [perizia.coordinate.longitude, perizia.coordinate.latitude], // Destinazione
  ];

  map.addSource("route", {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: coordinates,
      },
    },
  });

  map.addLayer({
    id: "route",
    type: "line",
    source: "route",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#3b9ddd",
      "line-width": 5,
    },
  });

  console.log("Percorso disegnato:", coordinates);
}

// Popola il filtro per operatori
function popolaFiltroOperatori(perizie) {
  let select = $("#operatoreSelect");
  select.empty();
  select.append(`<option value="all">Tutti</option>`);

  // Recupera i dettagli degli operatori direttamente dall'API
  let request = inviaRichiesta("GET", "/api/operatori");
  request.done(function (operatoriDettagli) {
    // Popola il filtro con gli username degli operatori
    for (const operatore of operatoriDettagli) {
      select.append(
        `<option value="${operatore._id}">${operatore.username}</option>`
      );
    }

    // Aggiungi evento per filtrare le perizie
    select.on("change", function () {
      let operatoreSelezionato = $(this).val();
      let perizieFiltrate =
        operatoreSelezionato === "all"
          ? perizie
          : perizie.filter((p) => p.codOperatore === operatoreSelezionato);

      // Ripopola la mappa con le perizie filtrate
      popolaMappa(perizieFiltrate);
      select.val(operatoreSelezionato);
    });
  });

  request.fail(function (jqXHR, textStatus, errorThrown) {
    console.error(
      "Errore nel recupero dei dettagli degli operatori:",
      textStatus,
      errorThrown
    );
    alert(
      "Impossibile recuperare i dettagli degli operatori. Riprova più tardi."
    );
  });
}

function inviaRichiesta(method, url, parameters = {}) {
  console.log("Invio richiesta:", method, url, parameters);
  let token = localStorage.getItem("token");
  return $.ajax({
    type: method,
    url: url,
    data: JSON.stringify(parameters),
    contentType: "application/json",
    dataType: "json",
    headers: {
      Authorization: token,
    },
    success: function (data, textStatus, jqXHR) {
      console.log("Risposta ricevuta:", data);
      const newToken = jqXHR.getResponseHeader("Authorization");
      if (newToken) {
        localStorage.setItem("token", newToken);
      }
    },
    error: function (jqXHR, textStatus, errorThrown) {
      console.error("Errore nella richiesta:", textStatus, errorThrown);
    },
  });
}

// Carica le perizie nella mappa e nella tabella
function caricaPerizie(operatoreId = null) {
  // Build the URL with query parameters instead of sending them in the body
  const url = operatoreId
    ? `/api/perizie?operatoreId=${operatoreId}`
    : "/api/perizie";
  const request = inviaRichiesta("GET", url);

  // Rest of the function remains the same
  request.done(function (perizie) {
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
          <tr>
            <td>${new Date(perizia["data-ora"]).toLocaleString()}</td>
            <td>${perizia.descrizione}</td>
            <td>${operatoreNome}</td>
          </tr>
        `);
      });

      // Popola la mappa
      popolaMappa(perizie);
    });
  });

  request.fail(function () {
    toastr.error("Errore durante il caricamento delle perizie.");
  });
}
