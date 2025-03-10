import * as fs from 'fs';

const locales: { [key: string]: any } = {
  en: JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8')),
  fa: JSON.parse(fs.readFileSync('src/locales/fa.json', 'utf8'))
};

// Default language for new users
const userLanguages: Map<number, string> = new Map();

export const getTranslation = (userId: number, key: string): string => {
  const lang = userLanguages.get(userId) || 'en';
  return locales[lang][key] || key;
};

export const setUserLanguage = (userId: number, lang: string) => {
  if (locales[lang]) {
    userLanguages.set(userId, lang);
  }
};