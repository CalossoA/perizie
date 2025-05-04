function inviaRichiesta(method, url, parameters = {}) {
  let token = localStorage.getItem("token"); // Recupera il token dal localStorage
  return $.ajax({
    type: method,
    url: url,
    data: method === "GET" ? parameters : JSON.stringify(parameters), // Invia i parametri solo se non sono vuoti
    contentType: method === "GET" ? undefined : "application/json", // Solo per POST/PUT
    dataType: "json",
    headers: {
      Authorization: token, // Aggiungi il token nell'intestazione
    },
  });
}

function errore(jqXHR, testStatus, strError) {
  if (jqXHR.status == 0) alert("Connection refused or Server timeout");
  else if (jqXHR.status == 200)
    alert("Formato dei dati non corretto : " + jqXHR.responseText);
  else if (jqXHR.status == 403) {
    window.location.href = "login.html";
  } else alert("Server Error: " + jqXHR.status + " - " + jqXHR.responseText);
}
