# Versleutelde backup en herstel van ABAS

Status 2026-10-05: Bram koos alleen bestanden en procedure voorbereiden.
Geen geplande taak, externe opslag, productie-export of restore uitgevoerd.
Een backup is pas bewezen herstelbaar na een geslaagde proef in een nieuwe,
geïsoleerde omgeving. De Free-projectlimiet verhindert momenteel die omgeving.

## Export

Benodigd: Node 24, Supabase CLI 2.118.0, Docker voor de dumpcontainer, tar,
GnuPG en een directe databaseverbinding of session-pooler op poort 5432.
Controleer eerst `supabase db dump --help`. De scriptopties zijn gebaseerd
op de [Supabase restorehandleiding](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

Maak een eigen GPG-sleutelpaar voor backups. Bewaar de privésleutel en
wachtwoord offline op twee beveiligde plaatsen; geef het exportscript alleen
de publieke sleutel en volledige fingerprint. Zonder privésleutel is herstel
onmogelijk. Zet echte credentials niet in shellhistorie of in deze repository.

Laad deze variabelen via een beveiligde secret-manager of een bestand buiten
de repository met alleen leesrechten voor de eigenaar:

| Variabele | Waarde |
| --- | --- |
| `BACKUP_PROJECT_REF` | `zlyysbywrvaolpslcbid` |
| `BACKUP_SUPABASE_URL` | `https://zlyysbywrvaolpslcbid.supabase.co` |
| `BACKUP_DB_URL` | Database-URL uit het juiste project's Connect-paneel |
| `BACKUP_SECRET_KEY` | Server-key van hetzelfde project |
| `BACKUP_OUTPUT_DIR` | Absoluut pad buiten de repository |
| `BACKUP_GPG_PUBLIC_KEY` | ASCII armored publieke sleutel |
| `BACKUP_GPG_FINGERPRINT` | Volledige 40-tekens fingerprint |

Voer `node scripts/backup-platform.mjs` uit. Het script vereist TLS en
controleert projectidentiteit, recipient en uitvoerpad vóór export. Het maakt
roles-, schema-, data- en migratiehistoriedumps, een referentie van beheerde
Auth/Storage-schema's, productafbeeldingen en SHA-256 manifests. Tijdelijke
plaintext wordt na succes of fout verwijderd. Uitvoer bevat alleen
`abas-<tijd>.tar.gz.gpg` en de checksum. Fouten tonen geen commandargumenten.

Let op: bestanden die tijdens export worden gewijzigd kunnen een verschil
tussen database en objectopslag geven. Gebruik voor een herstelproef een
rustig exportmoment en controleer verwijzingen na herstel. SQL-bestanden van
verschillende dumpstappen zijn geen gegarandeerd gezamenlijk snapshot.

Bewaar beide versleutelde bestanden en controleer `sha256sum -c <bestand>.sha256`.
Kopieer ze naar de later gekozen externe bestemming. Bewaar uitsluitend
ciphertext buiten het beveiligde exportapparaat; deel geen SQL-artifacts via CI.
Er is bewust nog geen scheduler, retentie- of verwijderactie ingesteld.

## Herstelproef

1. Maak een nieuw geïsoleerd Supabase-project met dezelfde Postgres-major en
   noodzakelijke extensies. Bevestig target-ref; gebruik nooit productie of
   een ander bestaand project. Leg projectplan, testkosten en starttijd vast.
2. Controleer de encrypted checksum, decrypt op een beveiligd apparaat met
   de offline privésleutel en pak uit in een nieuwe tijdelijke map. Controleer
   alle SQL-checksums uit `backup.json` en alle objectchecksums uit
   `product-images/manifest.json` vóór uitvoering.
3. Lees de actuele Supabase restorehandleiding vóór de SQL. Pas roles,
   schema en data volgens die volgorde toe, met `psql -v ON_ERROR_STOP=1`.
   Role-wachtwoorden zijn niet automatisch geëxporteerd; configureer die
   indien nodig apart. Zet uitsluitend de migratiehistorie van dezelfde
   geverifieerde export terug, inclusief schema en data.
4. Voer `managed_schema_reference.sql` **niet blind uit**. Vergelijk eigen
   triggers/policies/schema-uitbreidingen met de nieuwe beheerde Auth/Storage-
   structuur en herstel uitsluitend noodzakelijke customizations volgens de
   handleiding. Configureer Auth providers, callbacks, mail, API-keys,
   app-env-vars en eventuele encryptieroot-sleutel apart; een SQL-dump bevat
   niet alle platforminstellingen. Gebruik nooit productiecredentials in de
   testapp. Controleer specifiek herstel van MFA-login en bestaande accounts.
5. Upload elk bestand naar bucket `product-images` onder de oorspronkelijke
   `name` uit het manifest, met MIME-type `image/webp`. De veilige lokale
   genummerde naam is alleen exportopslag. Download terug en vergelijk hashes;
   controleer ook `products.image_path` en bucketlimieten/policies.
6. Vergelijk recordaantallen, financiële historie, saldi, receipts en
   migratieversies met de export. Controleer anonieme toegang, leden-RLS,
   bar/beheerlogin, tweede factor en weergave van productafbeeldingen. Doe
   eventuele testboekingen uitsluitend in deze wegwerpomgeving.
7. Noteer exporttijd, laatste inbegrepen mutatie, restoreduur, afwijkingen en
   resultaten. Daarmee worden werkelijk haalbare RPO/RTO zichtbaar. Verwijder
   plaintext en de tijdelijke omgeving pas na vastlegging van de proef.

## Acceptatieverslag

| Controle | Resultaat |
| --- | --- |
| Ontsleuteling + checksums | Nog geen echte export/proef |
| Schema/data/Auth/migratiehistorie | Nog niet hersteld |
| Storage-bestanden en verwijzingen | Nog niet hersteld |
| Login, MFA, RLS en financiële totalen | Nog niet getest op restore |
| Gemeten RPO/RTO | Nog niet gemeten |

De bronprocedure maakt een technische export mogelijk; dit verslag blijft
open totdat een echte backup én restore aantoonbaar slagen.
