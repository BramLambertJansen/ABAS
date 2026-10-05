# Financiële requests veilig herhalen (#143)

Status: voorstel goedgekeurd door Bram op 2026-10-05, inclusief behoud van
startsaldoregistratie. Implementatie wordt met volledige CI geverifieerd vóór uitrol.

## Probleem

Bij een weggevallen antwoord kan `place_order`, `top_up` of `create_member`
al verwerkt zijn. Een nieuwe aanroep kan dan een tweede boeking of tweede
lid maken. UI-blokkades alleen geven geen zekerheid over de serveruitkomst.

## Concreet voorstel

Een UUID `request_id` per bewuste actie, bewaard tot een bevestigde uitkomst.
De client gebruikt bij herhaling dezelfde sleutel en dezelfde parameters.
Een nieuwe bedoelde actie krijgt een nieuwe sleutel, ook bij gelijke invoer.
De server blijft bedragen bepalen en `served_by` tegen de bezetting toetsen.

Een interne, met RLS afgeschermde receipt-tabel bewaart sleutel, actor,
operatie, serverberekende parameterhash en het succesvolle resultaat. Geen
rechtstreekse API-rechten op die tabel of interne helpers. Nieuwe wrappers
behouden alle bestaande guards vóór zij een eerder resultaat teruggeven.
Geen resultaat van een andere actor, ook niet met dezelfde UUID.

Een transactielock per sleutel serialiseert gelijktijdige aanvragen. De
succesreceipt en de financiële mutatie worden in dezelfde transactie
geschreven. Een mislukt verzoek bewaart geen receipt. Een constraint op de
sleutel is de tweede bescherming; niet alleen een client-side check.

De UUID en parameters worden in de browser bewaard voor onbekende uitkomsten,
gebonden aan de ingelogde actor. Een onbekende uitkomst mag niet stil een
nieuwe sleutel krijgen bij herladen. Bevestigde successen wissen de pending
client-intent; de serverreceipt blijft. Nooit automatisch opnieuw boeken na
een sessie- of autorisatiefout.

## Besluiten — goedgekeurd op 2026-10-05

1. Eén interne receipt-tabel, geen verschillende losse sleutelkolommen.
2. Succesvolle sleutels niet automatisch laten verlopen. Een verlopen
   sleutel maakt een late retry anders alsnog een tweede boeking. Bewaren
   zolang de bijbehorende financiële historie bestaat; eventuele toekomstige
   verwijdering van historie moet receipts in dezelfde beheeractie behandelen.
3. Hergebruik met andere parameters of een andere actor weigeren met een
   vaste domeinfout; geen nieuwe boeking onder dezelfde sleutel.
4. In deze wijziging alleen `create_member` idempotent maken. De bestaande
   startsaldoboeking blijft zoals zij is. Een aparte startsaldo-transactierij
   verandert het logboek en de financiële rapportage en vraagt een eigen
   domeinbesluit; dat wordt niet stil in deze reparatie meegenomen.

## Acceptatie en negatieve tests

- Twee gelijke aanvragen leveren hetzelfde id en hetzelfde serverresultaat;
  saldo en transactieteller veranderen precies eenmaal.
- Ook twee gelijktijdige requests doen één boeking. Apart testen tegen echte
  Postgres-sessies; een sequentiële pgTAP-test bewijst concurrency niet.
- Dezelfde UUID met ander lid, bedrag, orderregels, actor of operatie faalt.
- Een nieuw request_id met gelijke invoer is wel een nieuwe bewuste actie.
- Ongeldige bezetting, lid-sessie, verlopen/beëindigde sessie, verkeerde modus
  en onvoldoende saldo blijven geweigerd; anoniem kan geen wrapper aanroepen.
- Een gecommitteerde response die de client niet ontving wordt bij retry
  teruggevonden. Retry na prijswijziging gebruikt het oorspronkelijke bedrag.
- Een gefaalde transactie geeft ruimte voor een geldige retry met dezelfde
  sleutel; geen vastgehouden pending receipt buiten de transactie.
- Create-member retourneert nooit pin_hash; interne receipts zijn voor geen
  API-rol leesbaar of schrijfbaar.
- Herladen bewaart de pending sleutel; uitloggen/inloggen wisselt de actor;
  een UI-fout of reset maakt niet stil een nieuwe geldactie.
- Bestaande pgTAP-, GoTrue-, Playwright- en geldhooktests blijven groen.

## Uitrol

Maak de migratie met de Supabase CLI en neem een uniek volgend nummer.
Voeg een ADR en catalogusindeling voor iedere nieuwe helper/wrapper toe.
Test de volledige stroom op een aparte database met uitsluitend testdata.
Gebruik een compatibele overgang voor de nog draaiende app; wijzig geen
bestaande RPC-signatuur zonder een expliciet gecoördineerde app-uitrol.
Pas na groene volledige CI en review komt deze wijziging naar productie.

## Uitwerking

Additieve RPC-namen zijn `place_order_once`, `top_up_once`, `create_member_once`.
De oude RPC-signaturen blijven tijdens de overgang behouden. Interne helpers
`read_money_request` en `remember_money_request` zijn voor geen API-rol uitvoerbaar.
De browser bewaart pending invoer per actor en operatie in lokale opslag. Web Locks
serialiseren tabbladen. Onbeschikbare opslag blokkeert verzending. Bij gewijzigde
invoer na een onbekende uitkomst volgt `pending_request`: rond eerst de eerdere
actie met dezelfde invoer af. Reset en de knop "Ik heb gecontroleerd" wissen
de sleutel niet. Sessiefouten bewaren de intent en voeren geen automatische retry uit.

Na herladen toont de actieve bar-/beheersessie een herstelknop voor bewaarde
acties. Een bewuste klik verstuurt de bewaarde invoer met dezelfde UUID en
ververst na bevestiging het scherm. Mounten en inloggen doen geen boeking.
De browser-hersteltest controleert een verloren antwoord en gelijkblijvende UUID.
Wrappers hebben ook EXECUTE voor service_role voor OpenAPI-contractcontrole,
met dezelfde verplichte sessieguards. Tabel en interne helpers blijven privé.
