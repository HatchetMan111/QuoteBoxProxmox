// Kategorie-Icons als Inline-SVG (raw import) - die API liefert nur den
// Dateinamen. currentColor in den SVGs folgt der Akzentfarbe per CSS.
import stoic from "./assets/icons/stoic.svg?raw";
import calendar from "./assets/icons/calendar.svg?raw";
import motivation from "./assets/icons/motivation.svg?raw";
import zen from "./assets/icons/zen.svg?raw";
import humor from "./assets/icons/humor.svg?raw";
import random from "./assets/icons/random.svg?raw";
import quote from "./assets/icons/quote.svg?raw";

export const ICONS = {
  "stoic.svg": stoic,
  "calendar.svg": calendar,
  "motivation.svg": motivation,
  "zen.svg": zen,
  "humor.svg": humor,
  "random.svg": random,
  "quote.svg": quote,
};
