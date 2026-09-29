# OSM Comune

Codice condiviso dai portali di OSM Partner Bologna: Academy Beauty, MBS Manager, MBS Emilia, I-Time, CPER e Catalogo Servizi.

Il file `osm-comune.js` contiene:

1. **Salvataggio sicuro**: niente salvataggi se il caricamento dal database non è riuscito, un avviso visibile se un salvataggio fallisce e un avviso quando i dati si avvicinano al limite di spazio.
2. **Accesso OSM**: accesso unico con Firebase Authentication, cioè la stessa email e la stessa password per tutti i portali, più il link "Password dimenticata?".
3. **Sincronizzazione tra colleghi**: se due persone lavorano insieme, le modifiche di entrambe vengono unite invece di sovrascriversi.

Ogni portale lo carica da `https://lorenzo-osm.github.io/osm-comune/osm-comune.js`. Una correzione fatta qui vale per tutti i portali entro circa 10 minuti.

Il repository contiene solo codice: nessun dato, nessuna password, nessuna informazione sui clienti.
