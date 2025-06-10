import ar from '../locales/ar.json';
import de from '../locales/de.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import it from '../locales/it.json';
import ko from '../locales/ko.json';
import ms from '../locales/ms.json';
import nl from '../locales/nl.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';
import uk from '../locales/uk.json';
import zh from '../locales/zh.json';

const locales: Record<string, Record<string, string>> = {
  en,
  es,
  zh,
  ru,
  ko,
  fr,
  de,
  pt,
  ar,
  nl,
  it,
  ms,
  uk,
};

export function t(
  locale: string | undefined,
  key: string,
  vars: Record<string, string | number> = {}
): string {
  const lang = locale && locales[locale] ? locale : 'en';
  const fallback = locales.en[key] || key;
  let text = locales[lang][key] || fallback;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
  }
  return text;
}
