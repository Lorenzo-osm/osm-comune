/* =====================================================================
   OSM COMUNE — codice condiviso dai portali OSM Partner Bologna
   (Academy Beauty, MBS Manager, MBS Emilia, I-Time, CPER, Catalogo Servizi)

   Contiene:
   1. SALVATAGGIO SICURO           — salvataggi protetti e avvisi di errore
   2. ACCESSO OSM                  — accesso unico con Firebase Authentication
   3. SINCRONIZZAZIONE TRA COLLEGHI — unione delle modifiche fatte in contemporanea

   Va caricato in ogni portale DOPO le librerie Firebase (app, firestore, auth)
   e DOPO lo script che crea `db` (firebase.firestore()).
   Una modifica qui vale per tutti i portali (entro circa 10 minuti, il tempo
   della cache di GitHub Pages).

   NON contiene dati, password o informazioni dei clienti: solo codice.
   ===================================================================== */

/* ===================== SALVATAGGIO SICURO =====================
   1. Non salva MAI se il caricamento iniziale dal database non è riuscito
      (evita di sovrascrivere i dati veri con quelli vuoti di partenza).
   2. Se un salvataggio fallisce mostra un banner rosso fisso con "Riprova"
      (prima l'errore finiva solo nella console e nessuno se ne accorgeva).
   3. Avvisa prima di chiudere la pagina se un salvataggio è in corso o è fallito.
   4. Avvisa quando i dati si avvicinano al limite di 1 MB per documento di Firestore. */
let _datiCaricati = false;
let _salvataggiInCorso = 0;
let _salvataggioFallito = false;
let _avvisoSpazioMostrato = false;
let _riprovaSalvataggio = null;
const LIMITE_DOC_BYTES = 1048576;

function _mostraBannerSalvataggio(tipo, testo, conRiprova) {
  let b = document.getElementById('banner-salvataggio');
  if (!b) {
    b = document.createElement('div');
    b.id = 'banner-salvataggio';
    b.setAttribute('role', 'alert');
    b.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;'
      + 'max-width:min(640px,calc(100vw - 32px));display:flex;align-items:center;gap:12px;flex-wrap:wrap;'
      + 'padding:12px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);'
      + 'font:600 14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
    document.body.appendChild(b);
  }
  const colori = tipo === 'avviso'
    ? { bg: '#fff4e0', fg: '#8a4b00', bordo: '#e0a040' }
    : { bg: '#fdecea', fg: '#a4281b', bordo: '#d9534f' };
  b.style.background = colori.bg;
  b.style.color = colori.fg;
  b.style.border = '2px solid ' + colori.bordo;
  b.innerHTML = '';
  const t = document.createElement('span');
  t.style.flex = '1';
  t.textContent = (tipo === 'avviso' ? '⚠️ ' : '⛔ ') + testo;
  b.appendChild(t);
  if (conRiprova) {
    const r = document.createElement('button');
    r.textContent = 'Riprova';
    r.style.cssText = 'background:' + colori.bordo + ';color:#fff;border:none;border-radius:8px;padding:7px 14px;font:inherit;cursor:pointer;';
    r.onclick = function() { if (_riprovaSalvataggio) _riprovaSalvataggio(); };
    b.appendChild(r);
  }
  const x = document.createElement('button');
  x.textContent = '✕';
  x.title = 'Chiudi';
  x.style.cssText = 'background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:4px 6px;';
  x.onclick = function() { b.remove(); };
  b.appendChild(x);
}

function _nascondiBannerSalvataggio() {
  const b = document.getElementById('banner-salvataggio');
  if (b) b.remove();
}

function _dimensioneDatiBytes(dati) {
  try { return new Blob([JSON.stringify(dati)]).size; } catch(e) { return 0; }
}

/* scrittura: funzione che restituisce la Promise di Firestore.
   datiPerDimensione (facoltativo): l'oggetto che finisce nel documento, per controllarne il peso.
   riprova: funzione da richiamare con il pulsante "Riprova". */
async function salvataggioSicuro(scrittura, datiPerDimensione, riprova) {
  if (riprova) _riprovaSalvataggio = riprova;
  if (!_datiCaricati) {
    _mostraBannerSalvataggio('errore', 'I dati non sono stati caricati correttamente: per sicurezza le modifiche NON vengono salvate. Ricarica la pagina.', false);
    return false;
  }
  if (datiPerDimensione) {
    const byte = _dimensioneDatiBytes(datiPerDimensione);
    if (byte > LIMITE_DOC_BYTES - 20000) {
      _salvataggioFallito = true;
      _mostraBannerSalvataggio('errore', 'Spazio del database esaurito (' + Math.round(byte / 1024) + ' KB su 1024): l\'ultima modifica NON è stata salvata. Avvisa l\'amministratore.', false);
      return false;
    }
    if (byte > LIMITE_DOC_BYTES * 0.8 && !_avvisoSpazioMostrato) {
      _avvisoSpazioMostrato = true;
      _mostraBannerSalvataggio('avviso', 'Il database di questo portale è pieno all\'' + Math.round(byte / LIMITE_DOC_BYTES * 100) + '%. Avvisa l\'amministratore prima che si esaurisca lo spazio.', false);
    }
  }
  _salvataggiInCorso++;
  try {
    await scrittura();
    if (_salvataggioFallito) { _salvataggioFallito = false; _nascondiBannerSalvataggio(); }
    return true;
  } catch(e) {
    console.error('[Salvataggio] Errore:', e);
    _salvataggioFallito = true;
    _mostraBannerSalvataggio('errore', 'Salvataggio NON riuscito: le ultime modifiche non sono state salvate. Controlla la connessione e premi Riprova.', true);
    return false;
  } finally {
    _salvataggiInCorso--;
  }
}

window.addEventListener('beforeunload', function(e) {
  if (_salvataggiInCorso > 0 || _salvataggioFallito) { e.preventDefault(); e.returnValue = ''; }
});

/* ===================== ACCESSO OSM (Firebase Authentication) =====================
   Accesso unico per tutti i portali OSM: i portali condividono lo stesso progetto
   Firebase, quindi la stessa email e la stessa password valgono ovunque (come in
   Clienti Fermi). Le password non sono più salvate nel database né scritte nel codice.
   Migrazione automatica: al primo accesso con la vecchia password del portale,
   l'account viene creato su Firebase Authentication e la password in chiaro
   viene cancellata dal database del portale. */
const _fbAuth = firebase.auth();
_fbAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(function() {});
let _fbAuthSecondaria = null;

/* App "secondaria": serve per creare l'account di un'altra persona senza
   disconnettere l'amministratore che lo sta creando. */
function _authSecondaria() {
  if (!_fbAuthSecondaria) {
    const esistente = firebase.apps.find(function(a) { return a.name === 'AccessoOsmSecondaria'; });
    const app = esistente || firebase.initializeApp(firebase.app().options, 'AccessoOsmSecondaria');
    _fbAuthSecondaria = app.auth();
    _fbAuthSecondaria.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(function() {});
  }
  return _fbAuthSecondaria;
}

/* Restituisce l'utente Firebase collegato in questa scheda (o null) */
function accessoOsmUtenteCorrente() {
  return new Promise(function(resolve) {
    let finito = false;
    let stop = null;
    const chiudi = function(u) {
      if (finito) return;
      finito = true;
      // la risposta può arrivare prima che onAuthStateChanged abbia restituito stop: si stacca dopo
      setTimeout(function() { if (stop) stop(); }, 0);
      resolve(u);
    };
    stop = _fbAuth.onAuthStateChanged(chiudi, function() { chiudi(_fbAuth.currentUser); });
    // rete lenta o assente: dopo 10 secondi si prosegue con quello che si sa
    setTimeout(function() { chiudi(_fbAuth.currentUser); }, 10000);
  });
}

const _ERRORI_CREDENZIALI = ['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/user-not-found'];

function messaggioErroreAccesso(e) {
  const c = (e && e.code) || '';
  if (_ERRORI_CREDENZIALI.indexOf(c) >= 0) return 'Email o password non corretti.';
  if (c === 'auth/invalid-email') return 'Indirizzo email non valido.';
  if (c === 'auth/too-many-requests') return 'Troppi tentativi falliti: attendi qualche minuto e riprova, oppure usa "Password dimenticata?".';
  if (c === 'auth/network-request-failed') return 'Connessione assente: controlla la rete e riprova.';
  if (c === 'auth/user-disabled') return 'Questo account è stato disattivato.';
  if (c === 'auth/weak-password') return 'La password deve avere almeno 6 caratteri.';
  return 'Operazione non riuscita (' + (c || (e && e.message) || 'errore sconosciuto') + ').';
}

/* Esegue l'accesso.
   cercaPasswordLegacy(email): funzione async che restituisce la vecchia password in chiaro
   ancora salvata nel portale per quell'email (o null), riletta dal database.
   Restituisce { ok: true, migrato: bool } oppure { ok: false, messaggio: '...' } */
async function accessoOsmLogin(email, password, cercaPasswordLegacy) {
  try {
    await _fbAuth.signInWithEmailAndPassword(email, password);
    return { ok: true, migrato: false };
  } catch (e) {
    if (_ERRORI_CREDENZIALI.indexOf(e.code) < 0) return { ok: false, messaggio: messaggioErroreAccesso(e) };
  }
  // Credenziali Firebase non valide: prova con la vecchia password del portale (migrazione)
  let legacy = null;
  try { legacy = await cercaPasswordLegacy(email); } catch (e) { legacy = null; }
  if (!legacy || legacy !== password) return { ok: false, messaggio: 'Email o password non corretti.' };
  try {
    await _fbAuth.createUserWithEmailAndPassword(email, password);
    return { ok: true, migrato: true };
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      return { ok: false, messaggio: 'Per questa email esiste già l\'accesso unico OSM (lo stesso di Clienti Fermi e degli altri portali): entra con quella password. Se non la ricordi, clicca "Password dimenticata?".' };
    }
    if (e.code === 'auth/weak-password') {
      // Vecchia password troppo corta per Firebase (minimo 6 caratteri): si crea l'account
      // con una password casuale e si invia l'email per sceglierne una nuova.
      try {
        const casuale = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-') + 'Aa!';
        await _authSecondaria().createUserWithEmailAndPassword(email, casuale);
        await _authSecondaria().signOut();
        await _fbAuth.sendPasswordResetEmail(email);
        return { ok: false, messaggio: 'La tua vecchia password era troppo corta per il nuovo accesso sicuro. Ti abbiamo inviato un\'email per sceglierne una nuova (almeno 6 caratteri): poi rientra con quella.' };
      } catch (e2) {
        return { ok: false, messaggio: messaggioErroreAccesso(e2) };
      }
    }
    return { ok: false, messaggio: messaggioErroreAccesso(e) };
  }
}

async function accessoOsmLogout() {
  try { await _fbAuth.signOut(); } catch (e) {}
}

/* Crea l'account di accesso di un'altra persona.
   Restituisce { ok: true, giaEsistente: bool } oppure { ok: false, messaggio } */
async function accessoOsmCreaAccount(email, password) {
  try {
    await _authSecondaria().createUserWithEmailAndPassword(email, password);
    await _authSecondaria().signOut();
    await accessoOsmAbilita(email);
    return { ok: true, giaEsistente: false };
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') { await accessoOsmAbilita(email); return { ok: true, giaEsistente: true }; }
    return { ok: false, messaggio: messaggioErroreAccesso(e) };
  }
}

/* Elenco delle email autorizzate a usare i dati dei portali (accesso-osm/elenco).
   Le regole di sicurezza del database fanno entrare solo chi è in questo elenco:
   avere un account Firebase non basta, perché chiunque può crearsene uno.
   Si aggiunge qui ogni volta che un amministratore crea un account. */
async function accessoOsmAbilita(email) {
  try {
    await db.collection('accesso-osm').doc('elenco').set({ utenti: { [(email || '').toLowerCase()]: true } }, { merge: true });
    return true;
  } catch (e) {
    console.error('[Accesso OSM] Errore aggiornamento elenco accessi:', e);
    return false;
  }
}

/* Cambia la password dell'utente collegato. Restituisce null se ok, altrimenti il messaggio di errore. */
async function accessoOsmCambiaPassword(attuale, nuova) {
  const u = _fbAuth.currentUser;
  if (!u) return 'Sessione scaduta: esci e rientra, poi riprova.';
  if (!nuova || nuova.length < 6) return 'La nuova password deve avere almeno 6 caratteri.';
  try {
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, attuale));
  } catch (e) {
    return _ERRORI_CREDENZIALI.indexOf(e.code) >= 0 ? 'Password attuale non corretta.' : messaggioErroreAccesso(e);
  }
  try {
    await u.updatePassword(nuova);
    return null;
  } catch (e) {
    return messaggioErroreAccesso(e);
  }
}

async function accessoOsmInviaReset(email) {
  if (!email) return 'Scrivi prima la tua email nel campo qui sopra.';
  try {
    await _fbAuth.sendPasswordResetEmail(email);
    return null;
  } catch (e) {
    return messaggioErroreAccesso(e);
  }
}

/* Aggiunge sotto al pulsante di accesso il link "Password dimenticata?" */
function accessoOsmAggiungiLinkReset(idInputEmail, elementoDopo) {
  if (!elementoDopo || document.getElementById('accesso-osm-reset')) return;
  const box = document.createElement('div');
  box.id = 'accesso-osm-reset';
  box.style.cssText = 'margin-top:12px;text-align:center;font-size:0.82rem;';
  const link = document.createElement('a');
  link.href = '#';
  link.textContent = 'Password dimenticata?';
  link.style.cssText = 'color:inherit;opacity:0.8;text-decoration:underline;cursor:pointer;';
  const msg = document.createElement('div');
  msg.style.cssText = 'margin-top:8px;line-height:1.45;';
  link.onclick = async function(ev) {
    ev.preventDefault();
    const campo = document.getElementById(idInputEmail);
    const email = campo ? campo.value.trim().toLowerCase() : '';
    msg.textContent = 'Invio in corso...';
    const errore = await accessoOsmInviaReset(email);
    msg.textContent = errore || ('Se ' + email + ' è registrata, riceverai a breve un\'email con il link per scegliere una nuova password (controlla anche lo spam). La nuova password varrà per tutti i portali OSM.');
  };
  box.appendChild(link);
  box.appendChild(msg);
  elementoDopo.insertAdjacentElement('afterend', box);
}

/* ===================== SINCRONIZZAZIONE TRA COLLEGHI =====================
   Prima ogni salvataggio riscriveva TUTTO il documento con la copia che il browser
   aveva in memoria: se due persone lavoravano insieme, chi salvava per ultimo
   cancellava le modifiche dell'altro senza accorgersene.
   Ora ogni salvataggio:
   1. rilegge il documento dal database (in una transazione);
   2. se un collega ha salvato nel frattempo, unisce le due versioni record per record
      (i record si riconoscono dal loro id): le modifiche di entrambi restano;
   3. solo se la STESSA informazione è stata cambiata da tutti e due, vale l'ultima.
   In più, se un collega salva mentre stai lavorando, compare un avviso con "Aggiorna". */
const _ASSENTE = { assente: true };

function _copiaProfonda(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function _eOggetto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

function _uguali(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!_uguali(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !_uguali(a[k], b[k])) return false;
  return true;
}

/* Tutti gli elementi sono oggetti con un id, e gli id non si ripetono */
function _elencoConIdUnici(arr) {
  const visti = new Set();
  for (const el of arr) {
    if (!_eOggetto(el) || el.id === undefined || el.id === null || el.id === '') return false;
    const id = String(el.id);
    if (visti.has(id)) return false;
    visti.add(id);
  }
  return true;
}
function _elencoDiValoriSemplici(arr) { return arr.every(x => x === null || typeof x !== 'object'); }

/* Valore di un campo nelle tre versioni (base = ultima versione comune, mio, loro).
   _ASSENTE indica che il campo/record non c'è in quella versione. */
function _unisciValore(b, m, l) {
  if (m === _ASSENTE && l === _ASSENTE) return _ASSENTE;
  if (m === _ASSENTE) {
    if (b === _ASSENTE) return l;              // aggiunto dal collega
    return _uguali(l, b) ? _ASSENTE : l;       // cancellato da me (se il collega l'ha modificato, si tiene)
  }
  if (l === _ASSENTE) {
    if (b === _ASSENTE) return m;              // aggiunto da me
    return _uguali(m, b) ? _ASSENTE : m;       // cancellato dal collega (se l'ho modificato io, si tiene)
  }
  return unisciTreVersioni(b === _ASSENTE ? undefined : b, m, l);
}

function unisciTreVersioni(base, mio, loro) {
  if (_uguali(mio, loro)) return mio;
  if (_uguali(mio, base)) return loro;         // l'ha cambiato solo il collega
  if (_uguali(loro, base)) return mio;         // l'ho cambiato solo io
  // Cambiato da entrambi: si scende nel dettaglio
  if (_eOggetto(mio) && _eOggetto(loro)) {
    const b = _eOggetto(base) ? base : {};
    const out = {};
    new Set([...Object.keys(b), ...Object.keys(mio), ...Object.keys(loro)]).forEach(k => {
      const v = _unisciValore(k in b ? b[k] : _ASSENTE, k in mio ? mio[k] : _ASSENTE, k in loro ? loro[k] : _ASSENTE);
      if (v !== _ASSENTE) out[k] = v;
    });
    return out;
  }
  if (Array.isArray(mio) && Array.isArray(loro)) {
    const b = Array.isArray(base) ? base : [];
    if (_elencoConIdUnici(mio) && _elencoConIdUnici(loro) && _elencoConIdUnici(b)) {
      // Record per record: prima l'ordine che vedo io, poi i record nuovi del collega
      const mappa = arr => new Map(arr.map(el => [String(el.id), el]));
      const B = mappa(b), M = mappa(mio), L = mappa(loro);
      const ordine = [];
      const visti = new Set();
      mio.concat(loro).forEach(el => { const id = String(el.id); if (!visti.has(id)) { visti.add(id); ordine.push(id); } });
      const out = [];
      ordine.forEach(id => {
        const v = _unisciValore(B.has(id) ? B.get(id) : _ASSENTE, M.has(id) ? M.get(id) : _ASSENTE, L.has(id) ? L.get(id) : _ASSENTE);
        if (v !== _ASSENTE) out.push(v);
      });
      return out;
    }
    if (_elencoDiValoriSemplici(mio) && _elencoDiValoriSemplici(loro) && _elencoDiValoriSemplici(b)) {
      // Elenchi semplici (es. edizioni, corsi): si tengono le aggiunte di entrambi e si tolgono le voci cancellate
      const toltiDaMe = b.filter(x => !mio.includes(x));
      const out = loro.filter(x => !toltiDaMe.includes(x));
      mio.forEach(x => { if (!b.includes(x) && !out.includes(x)) out.push(x); });
      return out;
    }
  }
  return mio; // stessa informazione cambiata da tutti e due: vale l'ultima modifica, cioè questa
}

/* Avviso "un collega ha modificato i dati" */
function _mostraAvvisoColleghi(onAggiorna) {
  let b = document.getElementById('avviso-colleghi');
  if (b) return;
  b = document.createElement('div');
  b.id = 'avviso-colleghi';
  b.setAttribute('role', 'status');
  b.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147482999;max-width:min(420px,calc(100vw - 32px));'
    + 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:#eaf3fd;color:#1c4f86;'
    + 'border:2px solid #6aa5e0;box-shadow:0 10px 30px rgba(0,0,0,.2);font:600 14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
  const t = document.createElement('span');
  t.style.flex = '1';
  t.textContent = '🔄 Un collega ha salvato delle modifiche.';
  const r = document.createElement('button');
  r.textContent = 'Aggiorna';
  r.style.cssText = 'background:#2f78c4;color:#fff;border:none;border-radius:8px;padding:7px 14px;font:inherit;cursor:pointer;';
  r.onclick = function() { b.remove(); onAggiorna(); };
  b.appendChild(t);
  b.appendChild(r);
  document.body.appendChild(b);
}
function _nascondiAvvisoColleghi() {
  const b = document.getElementById('avviso-colleghi');
  if (b) b.remove();
}
function _stoScrivendo() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
}

/* opz.ref()            → riferimento al documento Firestore
   opz.leggiLocale()    → il documento come andrebbe salvato adesso
   opz.applica(dati)    → rimette in memoria il documento unito
   opz.aggiornaVista()  → ridisegna la pagina aperta */
function creaSincronizzazione(opz) {
  let base = null;           // ultima versione comune con il database
  let ultimoScritto = null;  // ultima versione scritta da qui (per non avvisare delle proprie modifiche)
  let inCorso = null;
  let ancoraDaSalvare = false;
  let remotoInAttesa = null;
  let ascoltoAvviato = false;

  // Il pulsante "Aggiorna" applica le modifiche dei colleghi in attesa e ridisegna la pagina
  const aggiornaTutto = function() { if (remotoInAttesa) applicaRemoto(); else opz.aggiornaVista(); };
  const aggiornaOAvvisa = function() {
    if (_stoScrivendo()) _mostraAvvisoColleghi(aggiornaTutto);
    else opz.aggiornaVista();
  };

  async function eseguiSalvataggio() {
    const locale = _copiaProfonda(opz.leggiLocale());
    let unito = locale, cambiatoDaAltri = false;
    await db.runTransaction(async function(tx) {
      const snap = await tx.get(opz.ref());
      const remoto = snap.exists ? snap.data() : null;
      cambiatoDaAltri = !!(remoto && base && !_uguali(remoto, base));
      unito = cambiatoDaAltri ? unisciTreVersioni(base, locale, remoto) : locale;
      ultimoScritto = unito;
      tx.set(opz.ref(), unito);
    });
    base = _copiaProfonda(unito);
    if (cambiatoDaAltri) {
      remotoInAttesa = null;
      _nascondiAvvisoColleghi();
      // Le modifiche fatte mentre il salvataggio era in corso restano: si uniscono a quelle dei colleghi
      const adesso = _copiaProfonda(opz.leggiLocale());
      opz.applica(unisciTreVersioni(locale, adesso, _copiaProfonda(unito)));
      aggiornaOAvvisa();
    }
  }

  function salva() {
    // Salvataggi ravvicinati: se uno è già in corso, se ne fa uno solo in più alla fine
    if (inCorso) { ancoraDaSalvare = true; return inCorso; }
    inCorso = (async function() {
      try {
        do { ancoraDaSalvare = false; await eseguiSalvataggio(); } while (ancoraDaSalvare);
      } finally {
        inCorso = null;
      }
    })();
    return inCorso;
  }

  function applicaRemoto() {
    if (!remotoInAttesa) return;
    const remoto = remotoInAttesa;
    remotoInAttesa = null;
    const unito = base ? unisciTreVersioni(base, _copiaProfonda(opz.leggiLocale()), remoto) : remoto;
    base = _copiaProfonda(remoto);
    opz.applica(_copiaProfonda(unito));
    opz.aggiornaVista();
  }

  function avviaAscolto() {
    if (ascoltoAvviato) return;
    ascoltoAvviato = true;
    opz.ref().onSnapshot(function(snap) {
      if (!snap.exists || snap.metadata.hasPendingWrites || !base || inCorso) return;
      const remoto = snap.data();
      if (_uguali(remoto, base) || (ultimoScritto && _uguali(remoto, ultimoScritto))) return;
      remotoInAttesa = remoto;
      _mostraAvvisoColleghi(aggiornaTutto);
    }, function(e) { console.warn('[Sincronizzazione] Ascolto interrotto:', e); });
  }

  return {
    impostaBase: function(dati) { base = dati ? _copiaProfonda(dati) : null; },
    salva: salva,
    avviaAscolto: avviaAscolto
  };
}
