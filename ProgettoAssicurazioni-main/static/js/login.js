"use strict";

$(document).ready(function () {
  // Configurazione toastr
  toastr.options = {
    closeButton: true,
    progressBar: true,
    positionClass: "toast-top-right",
    timeOut: "3000",
  };

  let _username = "";
  let _userId = "";

  // Gestione click sul pulsante di login
  $("#btnLogin").on("click", function () {
    eseguiLogin();
  });

  // Gestione tasto Enter nei campi username e password
  $("#usr, #pwd").on("keypress", function (event) {
    if (event.keyCode === 13) {
      eseguiLogin();
    }
  });

  // Gestione click sul pulsante Chiudi dell'alert
  $("#lblErrore .close").on("click", function () {
    $("#lblErrore").addClass("d-none");
  });

  // Funzione per eseguire il login
  function eseguiLogin() {
    let username = $("#usr").val();
    let password = $("#pwd").val();

    if (!username || !password) {
      $("#lblErrore").removeClass("d-none");
      return;
    }

    let request = inviaRichiesta("POST", "/api/login", { username, password });

    request.done(function (data) {
      // Salva il token nel localStorage
      localStorage.setItem("token", data.token);

      // Controlla se l'utente deve reimpostare la password
      if (data.resetPassword) {
        // Salva username e userId per il reset della password
        _username = data.username;
        _userId = data._id;

        // Mostra la finestra modale per il reset della password
        $("#modalResetPassword").modal("show");
      } else {
        // Modifica: reindirizza basandosi sul nome utente esatto
        if (username === "Admin") {
          window.location.href = "userArea.html";
        } else {
          window.location.href = "index.html";
        }
      }
    });

    request.fail(function (jqXHR, textStatus, errorThrown) {
      if (jqXHR.status === 401) {
        $("#lblErrore").removeClass("d-none");
      } else {
        $("#lblErrore strong").text("Errore");
        $("#lblErrore")
          .find("strong")
          .siblings("text")
          .text(" Impossibile contattare il server");
        $("#lblErrore").removeClass("d-none");
      }
    });
  }

  // Validazione password in tempo reale
  $("#nuovaPassword").on("input", function () {
    const password = $(this).val();
    let strength = 0;

    // Criteri di validità
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[^A-Za-z0-9]/.test(password)) strength += 25;

    // Aggiorna la barra di avanzamento
    const strengthBar = $("#passwordStrengthBar");
    strengthBar.css("width", strength + "%");

    // Cambia il colore in base alla forza
    if (strength <= 25) {
      strengthBar.css("background-color", "#ff4d4d"); // Rosso
    } else if (strength <= 50) {
      strengthBar.css("background-color", "#ffa64d"); // Arancione
    } else if (strength <= 75) {
      strengthBar.css("background-color", "#ffff4d"); // Giallo
    } else {
      strengthBar.css("background-color", "#4dff4d"); // Verde
    }
  });

  // Gestione reset password
  $("#btnResetPassword").on("click", function () {
    const nuovaPassword = $("#nuovaPassword").val();
    const ripetiPassword = $("#ripetiPassword").val();

    // Validazione password
    if (nuovaPassword.length < 8) {
      toastr.error("La password deve contenere almeno 8 caratteri");
      return;
    }

    if (!/[A-Z]/.test(nuovaPassword)) {
      toastr.error("La password deve contenere almeno una lettera maiuscola");
      return;
    }

    if (!/[0-9]/.test(nuovaPassword)) {
      toastr.error("La password deve contenere almeno un numero");
      return;
    }

    if (!/[^A-Za-z0-9]/.test(nuovaPassword)) {
      toastr.error("La password deve contenere almeno un carattere speciale");
      return;
    }

    if (nuovaPassword !== ripetiPassword) {
      toastr.error("Le password non corrispondono");
      return;
    }

    // Invia richiesta per aggiornare la password
    const request = inviaRichiesta("POST", "/api/resetPassword", {
      userId: _userId,
      newPassword: nuovaPassword,
    });

    request.done(function (data) {
      toastr.success("Password aggiornata con successo");

      // Nascondi la modale
      $("#modalResetPassword").modal("hide");

      // Reindirizza dopo un breve ritardo
      setTimeout(function () {
        // Reindirizza basandosi sul nome utente salvato
        if (_username === "Admin") {
          window.location.href = "userArea.html";
        } else {
          window.location.href = "index.html";
        }
      }, 1500);
    });

    request.fail(function (jqXHR) {
      toastr.error(
        "Errore durante il reset della password: " + jqXHR.responseText
      );
    });
  });

  // Login con Google (se hai implementato OAuth)
  $("#btnLoginGoogle").on("click", function () {
    // Implementazione login con Google
  });
});

function inviaRichiesta(method, url, parameters = {}) {
  let token = localStorage.getItem("token"); // Recupera il token dal localStorage
  return $.ajax({
    type: method,
    url: url,
    data: JSON.stringify(parameters), // Assicurati che i dati siano in formato JSON
    contentType: "application/json", // Specifica il tipo di contenuto
    dataType: "json",
    headers: {
      Authorization: token, // Aggiungi il token nell'intestazione
    },
    success: function (data, textStatus, jqXHR) {
      const newToken = jqXHR.getResponseHeader("Authorization");
      if (newToken) {
        localStorage.setItem("token", newToken); // Aggiorna il token nel localStorage
      }
    },
  });
}
