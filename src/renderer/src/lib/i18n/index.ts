import i18next from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import { writable } from 'svelte/store'
import languages from './locales/languages.json'

const i18n = writable(i18next)
for (const event of ['initialized', 'loaded', 'languageChanged'] as const) {
  i18next.on(event, () => {
    document.documentElement.lang = i18next.resolvedLanguage || 'en-US'
    document.documentElement.dir = i18next.dir(document.documentElement.lang)
    i18n.set(i18next)
  })
}

export async function initI18n(defaultLocale?: string): Promise<void> {
  await i18next
    .use(
      resourcesToBackend(
        (language: string, namespace: string) => import(`./locales/${language}/${namespace}.json`)
      )
    )
    .use(LanguageDetector)
    .init({
      lng: defaultLocale || undefined,
      supportedLngs: languages.map(({ code }) => code),
      fallbackLng: 'en-US',
      ns: 'translation',
      detection: {
        order: ['querystring', 'localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupQuerystring: 'lang',
        lookupLocalStorage: 'locale'
      },
      returnEmptyString: false,
      interpolation: { escapeValue: false }
    })
  // The main window and Spotlight share Desktop's persisted locale preference.
  window.addEventListener('storage', (event) => {
    if (event.key === 'locale' && event.newValue && event.newValue !== i18next.language)
      void changeLanguage(event.newValue)
  })
}

export const getLanguages = (): typeof languages => languages
export const changeLanguage = (language: string): ReturnType<typeof i18next.changeLanguage> =>
  i18next.changeLanguage(language)

export default i18n
