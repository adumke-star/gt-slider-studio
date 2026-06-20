## Ziel
Statt alle Rennen gleichzeitig zu rendern, wird oben in der Headerleiste eine Navigation pro Serie (F1, MotoGP, DTM, WSBK) eingebaut. Hover/Klick öffnet ein Dropdown mit allen Rennen dieser Serie. Auswahl eines Rennens zeigt nur dieses eine Rennen im Hauptbereich.

## Vorgeschlagene Lösung
Ich finde deinen Ansatz gut, würde ihn aber leicht erweitern, damit du nicht jedes Mal navigieren musst:

1. **Serien-Navigation** in der Header-Leiste ersetzt die aktuellen Filter-Buttons (All / F1 / MotoGP / DTM / WSBK).
   - Jeder Serien-Eintrag (F1, MotoGP, DTM, WSBK) öffnet ein Dropdown mit den Rennen dieser Serie.
   - Eintrag „All races" pro Serie zeigt weiterhin alle Rennen einer Serie (wie bisher der Filter).
   - Zusätzlich ein „All" Eintrag ganz links, der wie heute alle Rennen aller Serien zeigt.
2. **Selektiertes Rennen** wird im aktiven Navigations-Item hervorgehoben (z. B. „F1 › Monza").
3. **Hauptbereich** rendert nur das ausgewählte Rennen (oder die Liste, wenn „All races" einer Serie / „All" gewählt ist).
4. **Status-Punkte** (orange für Changes, gelb für offene Kommentare) erscheinen auch im Dropdown neben jedem Rennen-Namen, damit du auch im eingeklappten Navigationsmenü siehst wo etwas offen ist.
5. **Reset**: Klick auf das Logo / „All" setzt den Filter zurück.

## Technische Details
- `src/routes/_authenticated/index.tsx`:
  - State `filter` erweitern zu `{ kind: "all" } | { kind: "series"; series } | { kind: "race"; raceId }`.
  - `visibleRaces` entsprechend ableiten.
  - Filter-Buttons durch shadcn `NavigationMenu` (oder `DropdownMenu` pro Serie) ersetzen.
- Neue Komponente `src/components/dashboard/RaceNav.tsx`:
  - Bekommt `races`, `images`, `selection`, `onSelect`.
  - Berechnet pro Rennen `hasChanges` / `hasOpenComments` aus den bereits geladenen `images` + einer Comment-Query (eine gemeinsame Query für alle offenen Kommentare statt pro Race-Card), Realtime-Subscription wie bisher.
  - Zeigt die kleinen orange/gelben Punkte neben Rennen-Namen im Dropdown.
- Keine Änderungen an `RaceCard` Logik notwendig.

## Offen
Soll der „All" Modus (alle Rennen aller Serien gleichzeitig) bleiben, oder lieber komplett entfernen, sodass immer eine Serie ausgewählt sein muss?
