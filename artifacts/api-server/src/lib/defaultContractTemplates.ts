export interface DefaultTemplate {
  language: string;
  title: string;
  content: string;
}

const en = `PHOTOBOOTH RENTAL AGREEMENT
Contract No.: {{contract_number}}
══════════════════════════════════════════════════

1. RENTAL COMPANY / PROVIDER

Company:            {{rental_company_name}}
Representative:     {{rental_company_representative}}
Address:            {{rental_company_address}}
Email:              {{rental_company_email}}
Phone:              {{rental_company_phone}}
Website:            {{rental_company_website}}
VAT / Reg. No.:     {{rental_company_vat}}

══════════════════════════════════════════════════

2. CLIENT

First Name:         {{client_first_name}}
Last Name:          {{client_last_name}}
Company:            {{client_company_name}}
Address:            {{client_address}}
Phone:              {{client_phone}}
Email:              {{client_email}}

══════════════════════════════════════════════════

3. EVENT DETAILS

Event Type:         {{event_type}}
Date:               {{event_date}}
Start Time:         {{event_start_time}}
End Time:           {{event_end_time}}
Venue / Location:   {{event_location}}
Setup Time:         {{setup_time}}
Pickup Time:        {{pickup_time}}

══════════════════════════════════════════════════

4. RENTED EQUIPMENT

{{equipment_list}}

══════════════════════════════════════════════════

5. PACKAGE & SERVICES

Package:            {{package_name}}
Rental Duration:    {{rental_duration}}
Included Prints:    {{included_prints}}
Digital Gallery:    {{digital_gallery}}
Custom Template:    {{custom_template}}
Delivery Included:  {{delivery_included}}
Setup Included:     {{setup_included}}
On-site Operator:   {{operator_included}}
Additional Options: {{options_list}}

══════════════════════════════════════════════════

6. PRICING

Rental Price:          {{rental_price}} {{currency}}
Additional Options:    {{options_price}} {{currency}}
Delivery Fees:         {{delivery_fees}} {{currency}}
Discount:             -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Subtotal:              {{subtotal}} {{currency}}
VAT ({{tax_rate}}%):   {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
TOTAL:                 {{total_amount}} {{currency}}

Payment Terms: {{payment_terms}}

══════════════════════════════════════════════════

7. DEPOSIT / SECURITY GUARANTEE

Amount:              {{deposit_amount}} {{currency}}
Method:              {{deposit_method}}
Conditions:          {{deposit_conditions}}
Return Conditions:   {{deposit_return}}

══════════════════════════════════════════════════

8. EQUIPMENT CONDITION

The equipment is provided in full working condition and must be returned in the same condition, subject to normal wear and tear. Any damage, loss, or missing accessories will be invoiced to the client at replacement cost.

══════════════════════════════════════════════════

9. CLIENT RESPONSIBILITIES

By signing this contract, the client agrees to:
- Use the equipment normally and for its intended purpose only
- Not dismantle, modify, or attempt to repair the equipment
- Protect the equipment from rain, humidity, shocks, theft, and misuse
- Ensure adequate access to electricity (standard 220V outlet)
- Return all accessories and components as originally provided
- Pay the full replacement cost for any damage, loss, or missing items
- Not sub-rent or lend the equipment to any third party

══════════════════════════════════════════════════

10. PROVIDER RESPONSIBILITIES

{{rental_company_name}} agrees to:
- Provide the rented equipment in full working condition
- Provide clear setup and operating instructions
- Deliver the agreed package and services as described above
- Provide a dedicated support contact for the duration of the event

══════════════════════════════════════════════════

11. CANCELLATION & POSTPONEMENT

{{cancellation_terms}}

Default conditions:
- Cancellation more than 30 days before the event: full deposit refund
- Cancellation between 15 and 30 days: 50% of total amount retained
- Cancellation less than 15 days before the event: full amount retained
- Postponement with 30+ days notice: free rescheduling (subject to availability)

══════════════════════════════════════════════════

12. LIABILITY

{{rental_company_name}} shall not be held liable for issues arising from: misuse of equipment, power failures at the venue, venue access restrictions, unavailability of required internet connection, or interference by third parties. Maximum liability is limited to the total amount paid under this contract.

══════════════════════════════════════════════════

13. ACCEPTANCE & SIGNATURES

Place:   {{signature_place}}
Date:    {{signature_date}}

CLIENT
Name: {{client_first_name}} {{client_last_name}}
"Read and approved"
Signature: _________________________________

─────────────────────────────────────────────────

PROVIDER
Name: {{rental_company_representative}}
On behalf of: {{rental_company_name}}
"Read and approved"
Signature: _________________________________

══════════════════════════════════════════════════`;

const fr = `CONTRAT DE LOCATION DE PHOTOBOOTH
Contrat N° : {{contract_number}}
══════════════════════════════════════════════════

1. SOCIÉTÉ DE LOCATION / PRESTATAIRE

Société :             {{rental_company_name}}
Représentant :        {{rental_company_representative}}
Adresse :             {{rental_company_address}}
E-mail :              {{rental_company_email}}
Téléphone :           {{rental_company_phone}}
Site web :            {{rental_company_website}}
TVA / SIRET :         {{rental_company_vat}}

══════════════════════════════════════════════════

2. CLIENT

Prénom :              {{client_first_name}}
Nom :                 {{client_last_name}}
Société :             {{client_company_name}}
Adresse :             {{client_address}}
Téléphone :           {{client_phone}}
E-mail :              {{client_email}}

══════════════════════════════════════════════════

3. DÉTAILS DE L'ÉVÉNEMENT

Type d'événement :    {{event_type}}
Date :                {{event_date}}
Heure de début :      {{event_start_time}}
Heure de fin :        {{event_end_time}}
Lieu / Adresse :      {{event_location}}
Heure d'installation :{{setup_time}}
Heure de récupération :{{pickup_time}}

══════════════════════════════════════════════════

4. MATÉRIEL LOUÉ

{{equipment_list}}

══════════════════════════════════════════════════

5. FORFAIT & PRESTATIONS

Forfait :             {{package_name}}
Durée de location :   {{rental_duration}}
Impressions incluses :{{included_prints}}
Galerie numérique :   {{digital_gallery}}
Gabarit personnalisé :{{custom_template}}
Livraison incluse :   {{delivery_included}}
Installation incluse :{{setup_included}}
Opérateur sur place : {{operator_included}}
Options supplémentaires : {{options_list}}

══════════════════════════════════════════════════

6. TARIFICATION

Prix de location :          {{rental_price}} {{currency}}
Options supplémentaires :   {{options_price}} {{currency}}
Frais de livraison :        {{delivery_fees}} {{currency}}
Remise :                   -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Sous-total :                {{subtotal}} {{currency}}
TVA ({{tax_rate}}%) :       {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
TOTAL :                     {{total_amount}} {{currency}}

Conditions de paiement : {{payment_terms}}

══════════════════════════════════════════════════

7. DÉPÔT DE GARANTIE

Montant :                   {{deposit_amount}} {{currency}}
Méthode :                   {{deposit_method}}
Conditions de rétention :   {{deposit_conditions}}
Conditions de restitution : {{deposit_return}}

══════════════════════════════════════════════════

8. ÉTAT DU MATÉRIEL

Le matériel est fourni en parfait état de fonctionnement et devra être restitué dans le même état, sous réserve d'une usure normale. Tout dommage, perte ou accessoire manquant sera facturé au client au prix de remplacement.

══════════════════════════════════════════════════

9. OBLIGATIONS DU CLIENT

En signant ce contrat, le client s'engage à :
- Utiliser le matériel normalement et conformément à sa destination
- Ne pas démonter, modifier ou tenter de réparer le matériel
- Protéger le matériel contre la pluie, l'humidité, les chocs, le vol et les mauvais traitements
- Assurer un accès suffisant à l'électricité (prise standard 220V)
- Restituer tous les accessoires et composants tels que fournis
- Payer le coût de remplacement complet en cas de dommage, perte ou article manquant
- Ne pas sous-louer ou prêter le matériel à des tiers

══════════════════════════════════════════════════

10. OBLIGATIONS DU PRESTATAIRE

{{rental_company_name}} s'engage à :
- Fournir le matériel loué en parfait état de fonctionnement
- Fournir des instructions claires d'installation et d'utilisation
- Délivrer le forfait et les prestations convenus tels que décrits ci-dessus
- Fournir un contact d'assistance dédié pendant toute la durée de l'événement

══════════════════════════════════════════════════

11. ANNULATION & REPORT

{{cancellation_terms}}

Conditions par défaut :
- Annulation plus de 30 jours avant l'événement : remboursement intégral de l'acompte
- Annulation entre 15 et 30 jours : 50 % du montant total retenu
- Annulation moins de 15 jours avant l'événement : montant total retenu
- Report avec plus de 30 jours de préavis : reprogrammation gratuite (sous réserve de disponibilité)

══════════════════════════════════════════════════

12. RESPONSABILITÉ

{{rental_company_name}} ne pourra être tenu responsable des problèmes résultant de : mauvaise utilisation du matériel, pannes d'électricité sur le lieu, restrictions d'accès à la salle, absence de connexion internet requise, ou interférence de tiers. La responsabilité maximale est limitée au montant total réglé par le client.

══════════════════════════════════════════════════

13. ACCEPTATION & SIGNATURES

Lieu :   {{signature_place}}
Date :   {{signature_date}}

CLIENT
Nom : {{client_first_name}} {{client_last_name}}
« Lu et approuvé »
Signature : _________________________________

─────────────────────────────────────────────────

PRESTATAIRE
Nom : {{rental_company_representative}}
Pour le compte de : {{rental_company_name}}
« Lu et approuvé »
Signature : _________________________________

══════════════════════════════════════════════════`;

const es = `CONTRATO DE ALQUILER DE PHOTOBOOTH
Contrato N°: {{contract_number}}
══════════════════════════════════════════════════

1. EMPRESA DE ALQUILER / PROVEEDOR

Empresa:              {{rental_company_name}}
Representante:        {{rental_company_representative}}
Dirección:            {{rental_company_address}}
Correo:               {{rental_company_email}}
Teléfono:             {{rental_company_phone}}
Sitio web:            {{rental_company_website}}
NIF / CIF / IVA:      {{rental_company_vat}}

══════════════════════════════════════════════════

2. CLIENTE

Nombre:               {{client_first_name}}
Apellidos:            {{client_last_name}}
Empresa:              {{client_company_name}}
Dirección:            {{client_address}}
Teléfono:             {{client_phone}}
Correo:               {{client_email}}

══════════════════════════════════════════════════

3. DETALLES DEL EVENTO

Tipo de evento:       {{event_type}}
Fecha:                {{event_date}}
Hora de inicio:       {{event_start_time}}
Hora de fin:          {{event_end_time}}
Lugar / Dirección:    {{event_location}}
Hora de montaje:      {{setup_time}}
Hora de recogida:     {{pickup_time}}

══════════════════════════════════════════════════

4. EQUIPO ALQUILADO

{{equipment_list}}

══════════════════════════════════════════════════

5. PAQUETE & SERVICIOS

Paquete:              {{package_name}}
Duración del alquiler:{{rental_duration}}
Impresiones incluidas:{{included_prints}}
Galería digital:      {{digital_gallery}}
Plantilla personalizada:{{custom_template}}
Entrega incluida:     {{delivery_included}}
Montaje incluido:     {{setup_included}}
Operador in situ:     {{operator_included}}
Opciones adicionales: {{options_list}}

══════════════════════════════════════════════════

6. PRECIOS

Precio de alquiler:      {{rental_price}} {{currency}}
Opciones adicionales:    {{options_price}} {{currency}}
Gastos de entrega:       {{delivery_fees}} {{currency}}
Descuento:              -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Subtotal:                {{subtotal}} {{currency}}
IVA ({{tax_rate}}%):     {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
TOTAL:                   {{total_amount}} {{currency}}

Condiciones de pago: {{payment_terms}}

══════════════════════════════════════════════════

7. DEPÓSITO / FIANZA

Importe:               {{deposit_amount}} {{currency}}
Método:                {{deposit_method}}
Condiciones:           {{deposit_conditions}}
Condiciones de devolución: {{deposit_return}}

══════════════════════════════════════════════════

8. ESTADO DEL EQUIPO

El equipo se entrega en perfecto estado de funcionamiento y deberá devolverse en las mismas condiciones, salvo desgaste normal. Cualquier daño, pérdida o accesorio faltante se facturará al cliente al precio de reposición.

══════════════════════════════════════════════════

9. RESPONSABILIDADES DEL CLIENTE

Al firmar este contrato, el cliente se compromete a:
- Utilizar el equipo de forma normal y para su uso previsto únicamente
- No desmontar, modificar ni intentar reparar el equipo
- Proteger el equipo contra lluvia, humedad, golpes, robo y mal uso
- Garantizar acceso adecuado a la electricidad (enchufe estándar 220V)
- Devolver todos los accesorios y componentes tal como se entregaron
- Pagar el coste íntegro de sustitución en caso de daño, pérdida o artículo faltante
- No subalquilar ni prestar el equipo a terceros

══════════════════════════════════════════════════

10. RESPONSABILIDADES DEL PROVEEDOR

{{rental_company_name}} se compromete a:
- Proporcionar el equipo alquilado en perfecto estado de funcionamiento
- Proporcionar instrucciones claras de montaje y uso
- Entregar el paquete y servicios acordados según lo descrito anteriormente
- Proporcionar un contacto de asistencia dedicado durante el evento

══════════════════════════════════════════════════

11. CANCELACIÓN & APLAZAMIENTO

{{cancellation_terms}}

Condiciones por defecto:
- Cancelación con más de 30 días de antelación: reembolso íntegro del depósito
- Cancelación entre 15 y 30 días: 50% del importe total retenido
- Cancelación con menos de 15 días: importe total retenido
- Aplazamiento con más de 30 días de aviso: reprogramación gratuita (sujeto a disponibilidad)

══════════════════════════════════════════════════

12. RESPONSABILIDAD CIVIL

{{rental_company_name}} no será responsable de problemas causados por: mal uso del equipo, fallos eléctricos en el local, restricciones de acceso, falta de conexión a internet requerida o interferencias de terceros. La responsabilidad máxima se limita al importe total pagado bajo este contrato.

══════════════════════════════════════════════════

13. ACEPTACIÓN & FIRMAS

Lugar:   {{signature_place}}
Fecha:   {{signature_date}}

CLIENTE
Nombre: {{client_first_name}} {{client_last_name}}
"Leído y aprobado"
Firma: _________________________________

─────────────────────────────────────────────────

PROVEEDOR
Nombre: {{rental_company_representative}}
En nombre de: {{rental_company_name}}
"Leído y aprobado"
Firma: _________________________________

══════════════════════════════════════════════════`;

const de = `MIETVERTRAG FÜR PHOTOBOOTH
Vertragsnummer: {{contract_number}}
══════════════════════════════════════════════════

1. VERMIETER / ANBIETER

Unternehmen:          {{rental_company_name}}
Vertreter:            {{rental_company_representative}}
Adresse:              {{rental_company_address}}
E-Mail:               {{rental_company_email}}
Telefon:              {{rental_company_phone}}
Webseite:             {{rental_company_website}}
USt-IdNr.:            {{rental_company_vat}}

══════════════════════════════════════════════════

2. MIETER / KUNDE

Vorname:              {{client_first_name}}
Nachname:             {{client_last_name}}
Unternehmen:          {{client_company_name}}
Adresse:              {{client_address}}
Telefon:              {{client_phone}}
E-Mail:               {{client_email}}

══════════════════════════════════════════════════

3. VERANSTALTUNGSDETAILS

Veranstaltungsart:    {{event_type}}
Datum:                {{event_date}}
Beginn:               {{event_start_time}}
Ende:                 {{event_end_time}}
Veranstaltungsort:    {{event_location}}
Aufbauzeit:           {{setup_time}}
Abholzeit:            {{pickup_time}}

══════════════════════════════════════════════════

4. GEMIETETES EQUIPMENT

{{equipment_list}}

══════════════════════════════════════════════════

5. PAKET & LEISTUNGEN

Paket:                {{package_name}}
Mietdauer:            {{rental_duration}}
Enthaltene Drucke:    {{included_prints}}
Digitale Galerie:     {{digital_gallery}}
Eigenes Template:     {{custom_template}}
Lieferung inklusive:  {{delivery_included}}
Aufbau inklusive:     {{setup_included}}
Operator vor Ort:     {{operator_included}}
Zusatzoptionen:       {{options_list}}

══════════════════════════════════════════════════

6. PREISÜBERSICHT

Mietpreis:              {{rental_price}} {{currency}}
Zusatzoptionen:         {{options_price}} {{currency}}
Lieferkosten:           {{delivery_fees}} {{currency}}
Rabatt:                -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Zwischensumme:          {{subtotal}} {{currency}}
MwSt. ({{tax_rate}}%):  {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
GESAMTBETRAG:           {{total_amount}} {{currency}}

Zahlungsbedingungen: {{payment_terms}}

══════════════════════════════════════════════════

7. KAUTION / SICHERHEITSLEISTUNG

Betrag:                   {{deposit_amount}} {{currency}}
Zahlungsmethode:          {{deposit_method}}
Einbehaltungsbedingungen: {{deposit_conditions}}
Rückgabebedingungen:      {{deposit_return}}

══════════════════════════════════════════════════

8. GERÄTEZUSTAND

Das Equipment wird in einwandfreiem Zustand übergeben und muss in demselben Zustand zurückgegeben werden, normaler Verschleiß ausgenommen. Schäden, Verluste oder fehlende Zubehörteile werden dem Mieter zum Wiederbeschaffungswert in Rechnung gestellt.

══════════════════════════════════════════════════

9. PFLICHTEN DES MIETERS

Mit Unterzeichnung dieses Vertrages verpflichtet sich der Mieter:
- Das Equipment bestimmungsgemäß und sachgerecht zu verwenden
- Das Equipment nicht zu demontieren, zu modifizieren oder eigenmächtig zu reparieren
- Das Equipment vor Regen, Feuchtigkeit, Stößen, Diebstahl und Missbrauch zu schützen
- Ausreichenden Zugang zu Strom sicherzustellen (Standard-Steckdose 220V)
- Alle Zubehörteile und Komponenten vollständig zurückzugeben
- Den vollen Wiederbeschaffungswert für Schäden, Verluste oder fehlende Teile zu erstatten
- Das Equipment nicht weiter zu vermieten oder an Dritte zu verleihen

══════════════════════════════════════════════════

10. PFLICHTEN DES ANBIETERS

{{rental_company_name}} verpflichtet sich:
- Das gemietete Equipment in einwandfreiem Zustand bereitzustellen
- Klare Aufbau- und Bedienungsanweisungen zu übergeben
- Das vereinbarte Paket und die Leistungen wie beschrieben zu erbringen
- Einen dedizierten Support-Kontakt für die Dauer der Veranstaltung bereitzustellen

══════════════════════════════════════════════════

11. STORNIERUNG & VERSCHIEBUNG

{{cancellation_terms}}

Standardbedingungen:
- Stornierung mehr als 30 Tage vor der Veranstaltung: vollständige Kautionsrückerstattung
- Stornierung zwischen 15 und 30 Tagen: 50% des Gesamtbetrags wird einbehalten
- Stornierung weniger als 15 Tage vor der Veranstaltung: Gesamtbetrag wird einbehalten
- Verschiebung mit mehr als 30 Tagen Vorlauf: kostenlose Umplanung (je nach Verfügbarkeit)

══════════════════════════════════════════════════

12. HAFTUNG

{{rental_company_name}} haftet nicht für Probleme, die entstehen durch: unsachgemäßen Gebrauch, Stromausfälle am Veranstaltungsort, Zugangsbeschränkungen, fehlende Internetverbindung oder Einwirkung Dritter. Die maximale Haftung beschränkt sich auf den unter diesem Vertrag gezahlten Gesamtbetrag.

══════════════════════════════════════════════════

13. EINVERSTÄNDNIS & UNTERSCHRIFTEN

Ort:     {{signature_place}}
Datum:   {{signature_date}}

MIETER
Name: {{client_first_name}} {{client_last_name}}
„Gelesen und genehmigt"
Unterschrift: _________________________________

─────────────────────────────────────────────────

ANBIETER
Name: {{rental_company_representative}}
Im Auftrag von: {{rental_company_name}}
„Gelesen und genehmigt"
Unterschrift: _________________________________

══════════════════════════════════════════════════`;

const nl = `VERHUUROVEREENKOMST PHOTOBOOTH
Contractnummer: {{contract_number}}
══════════════════════════════════════════════════

1. VERHUURDER / AANBIEDER

Bedrijf:              {{rental_company_name}}
Vertegenwoordiger:    {{rental_company_representative}}
Adres:                {{rental_company_address}}
E-mail:               {{rental_company_email}}
Telefoon:             {{rental_company_phone}}
Website:              {{rental_company_website}}
BTW / KvK-nummer:     {{rental_company_vat}}

══════════════════════════════════════════════════

2. HUURDER / KLANT

Voornaam:             {{client_first_name}}
Achternaam:           {{client_last_name}}
Bedrijf:              {{client_company_name}}
Adres:                {{client_address}}
Telefoon:             {{client_phone}}
E-mail:               {{client_email}}

══════════════════════════════════════════════════

3. EVENEMENTDETAILS

Type evenement:       {{event_type}}
Datum:                {{event_date}}
Begintijd:            {{event_start_time}}
Eindtijd:             {{event_end_time}}
Locatie / Adres:      {{event_location}}
Opbouwtijd:           {{setup_time}}
Ophaaltijd:           {{pickup_time}}

══════════════════════════════════════════════════

4. GEHUURD MATERIAAL

{{equipment_list}}

══════════════════════════════════════════════════

5. PAKKET & DIENSTEN

Pakket:               {{package_name}}
Huurperiode:          {{rental_duration}}
Inbegrepen afdrukken: {{included_prints}}
Digitale galerij:     {{digital_gallery}}
Aangepaste template:  {{custom_template}}
Bezorging inbegrepen: {{delivery_included}}
Opbouw inbegrepen:    {{setup_included}}
Operator ter plaatse: {{operator_included}}
Extra opties:         {{options_list}}

══════════════════════════════════════════════════

6. PRIJSOVERZICHT

Huurprijs:              {{rental_price}} {{currency}}
Extra opties:           {{options_price}} {{currency}}
Bezorgkosten:           {{delivery_fees}} {{currency}}
Korting:               -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Subtotaal:              {{subtotal}} {{currency}}
BTW ({{tax_rate}}%):    {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
TOTAAL:                 {{total_amount}} {{currency}}

Betalingsvoorwaarden: {{payment_terms}}

══════════════════════════════════════════════════

7. BORG / WAARBORGSOM

Bedrag:                {{deposit_amount}} {{currency}}
Betaalmethode:         {{deposit_method}}
Inhoudsvoorwaarden:    {{deposit_conditions}}
Teruggavevoorwaarden:  {{deposit_return}}

══════════════════════════════════════════════════

8. STAAT VAN HET MATERIAAL

Het materiaal wordt in perfecte werkende staat geleverd en moet in dezelfde staat worden teruggegeven, met uitzondering van normale slijtage. Schade, verlies of ontbrekende accessoires worden bij de huurder in rekening gebracht tegen vervangingswaarde.

══════════════════════════════════════════════════

9. VERPLICHTINGEN VAN DE HUURDER

Door dit contract te ondertekenen, verbindt de huurder zich ertoe:
- Het materiaal normaal en alleen voor het beoogde doel te gebruiken
- Het materiaal niet te demonteren, te wijzigen of te proberen te repareren
- Het materiaal te beschermen tegen regen, vocht, schokken, diefstal en misbruik
- Voldoende toegang tot elektriciteit te garanderen (standaard stopcontact 220V)
- Alle accessoires en componenten terug te geven zoals oorspronkelijk geleverd
- De volledige vervangingskosten te betalen voor schade, verlies of ontbrekende items
- Het materiaal niet door te verhuren of uit te lenen aan derden

══════════════════════════════════════════════════

10. VERPLICHTINGEN VAN DE VERHUURDER

{{rental_company_name}} verbindt zich ertoe:
- Het gehuurde materiaal in perfecte werkende staat ter beschikking te stellen
- Duidelijke instructies voor installatie en gebruik te verstrekken
- Het overeengekomen pakket en de diensten te leveren zoals hierboven beschreven
- Een toegewijd supportcontact te voorzien gedurende het evenement

══════════════════════════════════════════════════

11. ANNULERING & UITSTEL

{{cancellation_terms}}

Standaardvoorwaarden:
- Annulering meer dan 30 dagen voor het evenement: volledige terugbetaling van de borg
- Annulering tussen 15 en 30 dagen: 50% van het totaalbedrag wordt ingehouden
- Annulering minder dan 15 dagen voor het evenement: volledig bedrag wordt ingehouden
- Uitstel met meer dan 30 dagen opzegtermijn: gratis herverscheduling (afhankelijk van beschikbaarheid)

══════════════════════════════════════════════════

12. AANSPRAKELIJKHEID

{{rental_company_name}} is niet aansprakelijk voor problemen veroorzaakt door: verkeerd gebruik van materiaal, stroomuitval op de locatie, toegangsbeperkingen, ontbreken van vereiste internetverbinding of inmenging van derden. De maximale aansprakelijkheid is beperkt tot het totale bedrag betaald onder dit contract.

══════════════════════════════════════════════════

13. AANVAARDING & HANDTEKENINGEN

Plaats:  {{signature_place}}
Datum:   {{signature_date}}

HUURDER
Naam: {{client_first_name}} {{client_last_name}}
"Gelezen en goedgekeurd"
Handtekening: _________________________________

─────────────────────────────────────────────────

VERHUURDER
Naam: {{rental_company_representative}}
Namens: {{rental_company_name}}
"Gelezen en goedgekeurd"
Handtekening: _________________________________

══════════════════════════════════════════════════`;

const it = `CONTRATTO DI NOLEGGIO PHOTOBOOTH
Contratto N°: {{contract_number}}
══════════════════════════════════════════════════

1. SOCIETÀ DI NOLEGGIO / FORNITORE

Azienda:              {{rental_company_name}}
Rappresentante:       {{rental_company_representative}}
Indirizzo:            {{rental_company_address}}
E-mail:               {{rental_company_email}}
Telefono:             {{rental_company_phone}}
Sito web:             {{rental_company_website}}
P.IVA / Reg.:         {{rental_company_vat}}

══════════════════════════════════════════════════

2. CLIENTE

Nome:                 {{client_first_name}}
Cognome:              {{client_last_name}}
Azienda:              {{client_company_name}}
Indirizzo:            {{client_address}}
Telefono:             {{client_phone}}
E-mail:               {{client_email}}

══════════════════════════════════════════════════

3. DETTAGLI DELL'EVENTO

Tipo di evento:       {{event_type}}
Data:                 {{event_date}}
Orario inizio:        {{event_start_time}}
Orario fine:          {{event_end_time}}
Luogo / Indirizzo:    {{event_location}}
Orario montaggio:     {{setup_time}}
Orario ritiro:        {{pickup_time}}

══════════════════════════════════════════════════

4. ATTREZZATURA NOLEGGIATA

{{equipment_list}}

══════════════════════════════════════════════════

5. PACCHETTO & SERVIZI

Pacchetto:            {{package_name}}
Durata noleggio:      {{rental_duration}}
Stampe incluse:       {{included_prints}}
Galleria digitale:    {{digital_gallery}}
Template personalizzato:{{custom_template}}
Consegna inclusa:     {{delivery_included}}
Montaggio incluso:    {{setup_included}}
Operatore in loco:    {{operator_included}}
Opzioni aggiuntive:   {{options_list}}

══════════════════════════════════════════════════

6. PREZZI

Prezzo di noleggio:      {{rental_price}} {{currency}}
Opzioni aggiuntive:      {{options_price}} {{currency}}
Spese di consegna:       {{delivery_fees}} {{currency}}
Sconto:                 -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Subtotale:               {{subtotal}} {{currency}}
IVA ({{tax_rate}}%):     {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
TOTALE:                  {{total_amount}} {{currency}}

Condizioni di pagamento: {{payment_terms}}

══════════════════════════════════════════════════

7. DEPOSITO / CAUZIONE

Importo:               {{deposit_amount}} {{currency}}
Metodo:                {{deposit_method}}
Condizioni:            {{deposit_conditions}}
Condizioni di restituzione: {{deposit_return}}

══════════════════════════════════════════════════

8. STATO DELL'ATTREZZATURA

L'attrezzatura viene fornita in perfetto stato di funzionamento e deve essere restituita nelle stesse condizioni, salvo normale usura. Qualsiasi danno, perdita o accessorio mancante sarà addebitato al cliente al prezzo di sostituzione.

══════════════════════════════════════════════════

9. RESPONSABILITÀ DEL CLIENTE

Firmando questo contratto, il cliente si impegna a:
- Utilizzare l'attrezzatura normalmente e solo per lo scopo previsto
- Non smontare, modificare o tentare di riparare l'attrezzatura
- Proteggere l'attrezzatura da pioggia, umidità, urti, furto e uso improprio
- Garantire accesso adeguato all'elettricità (presa standard 220V)
- Restituire tutti gli accessori e i componenti come originariamente forniti
- Pagare il costo di sostituzione integrale per danni, perdite o articoli mancanti
- Non subaffittare né prestare l'attrezzatura a terzi

══════════════════════════════════════════════════

10. RESPONSABILITÀ DEL FORNITORE

{{rental_company_name}} si impegna a:
- Fornire l'attrezzatura noleggiata in perfetto stato di funzionamento
- Fornire istruzioni chiare di installazione e utilizzo
- Consegnare il pacchetto e i servizi concordati come descritto sopra
- Fornire un contatto di supporto dedicato per tutta la durata dell'evento

══════════════════════════════════════════════════

11. ANNULLAMENTO & RINVIO

{{cancellation_terms}}

Condizioni standard:
- Annullamento oltre 30 giorni prima dell'evento: rimborso integrale del deposito
- Annullamento tra 15 e 30 giorni: 50% dell'importo totale trattenuto
- Annullamento meno di 15 giorni prima dell'evento: importo totale trattenuto
- Rinvio con oltre 30 giorni di preavviso: riprogrammazione gratuita (salvo disponibilità)

══════════════════════════════════════════════════

12. RESPONSABILITÀ CIVILE

{{rental_company_name}} non sarà ritenuto responsabile per problemi causati da: uso improprio dell'attrezzatura, interruzioni di corrente presso la sede, restrizioni di accesso, assenza di connessione internet richiesta o interferenze di terzi. La responsabilità massima è limitata all'importo totale pagato nell'ambito di questo contratto.

══════════════════════════════════════════════════

13. ACCETTAZIONE & FIRME

Luogo:   {{signature_place}}
Data:    {{signature_date}}

CLIENTE
Nome: {{client_first_name}} {{client_last_name}}
"Letto e approvato"
Firma: _________________________________

─────────────────────────────────────────────────

FORNITORE
Nome: {{rental_company_representative}}
Per conto di: {{rental_company_name}}
"Letto e approvato"
Firma: _________________________________

══════════════════════════════════════════════════`;

const pt = `CONTRATO DE ALUGUEL DE PHOTOBOOTH
Contrato N°: {{contract_number}}
══════════════════════════════════════════════════

1. EMPRESA DE ALUGUEL / FORNECEDOR

Empresa:              {{rental_company_name}}
Representante:        {{rental_company_representative}}
Endereço:             {{rental_company_address}}
E-mail:               {{rental_company_email}}
Telefone:             {{rental_company_phone}}
Website:              {{rental_company_website}}
NIF / NIPC:           {{rental_company_vat}}

══════════════════════════════════════════════════

2. CLIENTE

Nome:                 {{client_first_name}}
Apelido:              {{client_last_name}}
Empresa:              {{client_company_name}}
Endereço:             {{client_address}}
Telefone:             {{client_phone}}
E-mail:               {{client_email}}

══════════════════════════════════════════════════

3. DETALHES DO EVENTO

Tipo de evento:       {{event_type}}
Data:                 {{event_date}}
Hora de início:       {{event_start_time}}
Hora de fim:          {{event_end_time}}
Local / Endereço:     {{event_location}}
Hora de montagem:     {{setup_time}}
Hora de recolha:      {{pickup_time}}

══════════════════════════════════════════════════

4. EQUIPAMENTO ALUGADO

{{equipment_list}}

══════════════════════════════════════════════════

5. PACOTE & SERVIÇOS

Pacote:               {{package_name}}
Duração do aluguel:   {{rental_duration}}
Impressões incluídas: {{included_prints}}
Galeria digital:      {{digital_gallery}}
Template personalizado:{{custom_template}}
Entrega incluída:     {{delivery_included}}
Montagem incluída:    {{setup_included}}
Operador no local:    {{operator_included}}
Opções adicionais:    {{options_list}}

══════════════════════════════════════════════════

6. PREÇOS

Preço de aluguel:        {{rental_price}} {{currency}}
Opções adicionais:       {{options_price}} {{currency}}
Taxas de entrega:        {{delivery_fees}} {{currency}}
Desconto:               -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Subtotal:                {{subtotal}} {{currency}}
IVA ({{tax_rate}}%):     {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
TOTAL:                   {{total_amount}} {{currency}}

Condições de pagamento: {{payment_terms}}

══════════════════════════════════════════════════

7. DEPÓSITO / CAUÇÃO

Valor:                  {{deposit_amount}} {{currency}}
Método:                 {{deposit_method}}
Condições:              {{deposit_conditions}}
Condições de devolução: {{deposit_return}}

══════════════════════════════════════════════════

8. ESTADO DO EQUIPAMENTO

O equipamento é fornecido em plenas condições de funcionamento e deve ser devolvido nas mesmas condições, ressalvado o desgaste normal. Qualquer dano, perda ou acessório em falta será faturado ao cliente pelo preço de substituição.

══════════════════════════════════════════════════

9. RESPONSABILIDADES DO CLIENTE

Ao assinar este contrato, o cliente compromete-se a:
- Utilizar o equipamento normalmente e apenas para o fim previsto
- Não desmontar, modificar ou tentar reparar o equipamento
- Proteger o equipamento contra chuva, humidade, choques, furto e uso indevido
- Garantir acesso adequado à eletricidade (tomada padrão 220V)
- Devolver todos os acessórios e componentes tal como originalmente fornecidos
- Pagar o custo de substituição integral por danos, perdas ou itens em falta
- Não subalugar nem emprestar o equipamento a terceiros

══════════════════════════════════════════════════

10. RESPONSABILIDADES DO FORNECEDOR

{{rental_company_name}} compromete-se a:
- Fornecer o equipamento alugado em plenas condições de funcionamento
- Fornecer instruções claras de instalação e utilização
- Entregar o pacote e serviços acordados conforme descrito acima
- Fornecer um contacto de suporte dedicado durante o evento

══════════════════════════════════════════════════

11. CANCELAMENTO & ADIAMENTO

{{cancellation_terms}}

Condições padrão:
- Cancelamento com mais de 30 dias de antecedência: reembolso integral do depósito
- Cancelamento entre 15 e 30 dias: 50% do montante total retido
- Cancelamento com menos de 15 dias: montante total retido
- Adiamento com mais de 30 dias de aviso: reagendamento gratuito (sujeito a disponibilidade)

══════════════════════════════════════════════════

12. RESPONSABILIDADE CIVIL

{{rental_company_name}} não será responsável por problemas causados por: uso indevido do equipamento, falhas de energia no local, restrições de acesso, falta de ligação à internet necessária ou interferência de terceiros. A responsabilidade máxima é limitada ao montante total pago ao abrigo deste contrato.

══════════════════════════════════════════════════

13. ACEITAÇÃO & ASSINATURAS

Local:   {{signature_place}}
Data:    {{signature_date}}

CLIENTE
Nome: {{client_first_name}} {{client_last_name}}
"Lido e aprovado"
Assinatura: _________________________________

─────────────────────────────────────────────────

FORNECEDOR
Nome: {{rental_company_representative}}
Em nome de: {{rental_company_name}}
"Lido e aprovado"
Assinatura: _________________________________

══════════════════════════════════════════════════`;

const pl = `UMOWA NAJMU FOTOBUDKI
Numer umowy: {{contract_number}}
══════════════════════════════════════════════════

1. FIRMA WYNAJMUJĄCA / USŁUGODAWCA

Firma:                {{rental_company_name}}
Przedstawiciel:       {{rental_company_representative}}
Adres:                {{rental_company_address}}
E-mail:               {{rental_company_email}}
Telefon:              {{rental_company_phone}}
Strona www:           {{rental_company_website}}
NIP / KRS:            {{rental_company_vat}}

══════════════════════════════════════════════════

2. NAJEMCA / KLIENT

Imię:                 {{client_first_name}}
Nazwisko:             {{client_last_name}}
Firma:                {{client_company_name}}
Adres:                {{client_address}}
Telefon:              {{client_phone}}
E-mail:               {{client_email}}

══════════════════════════════════════════════════

3. SZCZEGÓŁY WYDARZENIA

Rodzaj wydarzenia:    {{event_type}}
Data:                 {{event_date}}
Godzina rozpoczęcia:  {{event_start_time}}
Godzina zakończenia:  {{event_end_time}}
Miejsce / Adres:      {{event_location}}
Godzina montażu:      {{setup_time}}
Godzina odbioru:      {{pickup_time}}

══════════════════════════════════════════════════

4. WYNAJMOWANY SPRZĘT

{{equipment_list}}

══════════════════════════════════════════════════

5. PAKIET & USŁUGI

Pakiet:               {{package_name}}
Czas najmu:           {{rental_duration}}
Wydruki w pakiecie:   {{included_prints}}
Galeria cyfrowa:      {{digital_gallery}}
Własny szablon:       {{custom_template}}
Dostawa w cenie:      {{delivery_included}}
Montaż w cenie:       {{setup_included}}
Operator na miejscu:  {{operator_included}}
Opcje dodatkowe:      {{options_list}}

══════════════════════════════════════════════════

6. CENNIK

Cena najmu:             {{rental_price}} {{currency}}
Opcje dodatkowe:        {{options_price}} {{currency}}
Koszty dostawy:         {{delivery_fees}} {{currency}}
Rabat:                 -{{discount_amount}} {{currency}}
─────────────────────────────────────────────────
Suma częściowa:         {{subtotal}} {{currency}}
VAT ({{tax_rate}}%):    {{tax_amount}} {{currency}}
─────────────────────────────────────────────────
ŁĄCZNIE:                {{total_amount}} {{currency}}

Warunki płatności: {{payment_terms}}

══════════════════════════════════════════════════

7. KAUCJA / ZABEZPIECZENIE

Kwota:                 {{deposit_amount}} {{currency}}
Metoda:                {{deposit_method}}
Warunki zatrzymania:   {{deposit_conditions}}
Warunki zwrotu:        {{deposit_return}}

══════════════════════════════════════════════════

8. STAN SPRZĘTU

Sprzęt jest przekazywany w pełnej sprawności technicznej i musi zostać zwrócony w tym samym stanie, z uwzględnieniem normalnego zużycia. Wszelkie uszkodzenia, utrata lub brakujące akcesoria zostaną obciążone najemcy w cenie zakupu.

══════════════════════════════════════════════════

9. OBOWIĄZKI NAJEMCY

Podpisując niniejszą umowę, najemca zobowiązuje się do:
- Użytkowania sprzętu w sposób zgodny z jego przeznaczeniem
- Niedemontowania, niemodyfikowania ani nienaprawiania sprzętu we własnym zakresie
- Ochrony sprzętu przed deszczem, wilgocią, uderzeniami, kradzieżą i niewłaściwym użytkowaniem
- Zapewnienia odpowiedniego dostępu do zasilania elektrycznego (standardowe gniazdko 220V)
- Zwrotu wszystkich akcesoriów i komponentów w stanie oryginalnym
- Pokrycia pełnych kosztów wymiany za uszkodzenia, utratę lub brakujące elementy
- Niepodnajmowania ani nieużyczania sprzętu osobom trzecim

══════════════════════════════════════════════════

10. OBOWIĄZKI USŁUGODAWCY

{{rental_company_name}} zobowiązuje się do:
- Udostępnienia wynajmowanego sprzętu w pełnej sprawności technicznej
- Przekazania jasnych instrukcji montażu i obsługi
- Realizacji uzgodnionego pakietu i usług zgodnie z powyższym opisem
- Zapewnienia dedykowanego kontaktu wsparcia na czas trwania wydarzenia

══════════════════════════════════════════════════

11. ANULOWANIE & ZMIANA TERMINU

{{cancellation_terms}}

Warunki standardowe:
- Anulowanie ponad 30 dni przed wydarzeniem: pełny zwrot kaucji
- Anulowanie w terminie 15–30 dni: 50% całkowitej kwoty zostaje zatrzymane
- Anulowanie w terminie poniżej 15 dni: cała kwota zostaje zatrzymana
- Zmiana terminu z ponad 30-dniowym wyprzedzeniem: bezpłatne przeplanowanie (zależnie od dostępności)

══════════════════════════════════════════════════

12. ODPOWIEDZIALNOŚĆ

{{rental_company_name}} nie ponosi odpowiedzialności za problemy wynikające z: niewłaściwego użytkowania sprzętu, awarii zasilania w miejscu wydarzenia, ograniczeń dostępu, braku wymaganego połączenia internetowego lub ingerencji osób trzecich. Maksymalna odpowiedzialność ograniczona jest do całkowitej kwoty zapłaconej na podstawie niniejszej umowy.

══════════════════════════════════════════════════

13. AKCEPTACJA & PODPISY

Miejscowość: {{signature_place}}
Data:        {{signature_date}}

NAJEMCA
Imię i nazwisko: {{client_first_name}} {{client_last_name}}
„Zapoznałem/am się i akceptuję"
Podpis: _________________________________

─────────────────────────────────────────────────

USŁUGODAWCA
Imię i nazwisko: {{rental_company_representative}}
W imieniu: {{rental_company_name}}
„Zapoznałem/am się i akceptuję"
Podpis: _________________________________

══════════════════════════════════════════════════`;

export const DEFAULT_CONTRACT_TEMPLATES: DefaultTemplate[] = [
  { language: "en", title: "Photobooth Rental Agreement", content: en },
  { language: "fr", title: "Contrat de Location de Photobooth", content: fr },
  { language: "es", title: "Contrato de Alquiler de Photobooth", content: es },
  { language: "de", title: "Mietvertrag für Photobooth", content: de },
  { language: "nl", title: "Verhuurovereenkomst Photobooth", content: nl },
  { language: "it", title: "Contratto di Noleggio Photobooth", content: it },
  { language: "pt", title: "Contrato de Aluguel de Photobooth", content: pt },
  { language: "pl", title: "Umowa Najmu Fotobudki", content: pl },
];

export const TEMPLATE_VARIABLES = [
  "contract_number",
  "rental_company_name",
  "rental_company_representative",
  "rental_company_address",
  "rental_company_email",
  "rental_company_phone",
  "rental_company_website",
  "rental_company_vat",
  "client_first_name",
  "client_last_name",
  "client_company_name",
  "client_address",
  "client_phone",
  "client_email",
  "event_type",
  "event_date",
  "event_start_time",
  "event_end_time",
  "event_location",
  "setup_time",
  "pickup_time",
  "equipment_list",
  "package_name",
  "rental_duration",
  "included_prints",
  "digital_gallery",
  "custom_template",
  "delivery_included",
  "setup_included",
  "operator_included",
  "options_list",
  "rental_price",
  "options_price",
  "delivery_fees",
  "discount_amount",
  "subtotal",
  "tax_rate",
  "tax_amount",
  "total_amount",
  "currency",
  "payment_terms",
  "deposit_amount",
  "deposit_method",
  "deposit_conditions",
  "deposit_return",
  "cancellation_terms",
  "signature_place",
  "signature_date",
] as const;
