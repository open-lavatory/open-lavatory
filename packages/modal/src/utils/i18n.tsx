import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
  type ParentComponent,
  useContext,
} from "solid-js";
import { match } from "ts-pattern";

import fallbackEnglish from "../../lang/en.json" with { type: "json" };
import { useModalContext } from "../context.jsx";

export type LanguageTag
  = | "en"
    | "nl"
    | "fr"
    | "es"
    | "sv"
    | "zh-cn"
    | "ar"
    | "he"
    | "fa";

export type LanguageInfo = {
  tag: LanguageTag;
  name: string;
  nativeName: string;
  rtl?: boolean;
};

export const LANGUAGES: LanguageInfo[] = [
  { tag: "en", name: "English", nativeName: "English" },
  { tag: "nl", name: "Dutch", nativeName: "Nederlands" },
  { tag: "es", name: "Spanish", nativeName: "Español" },
  { tag: "sv", name: "Swedish", nativeName: "Svenska" },
  { tag: "zh-cn", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { tag: "fr", name: "French", nativeName: "Français" },
  { tag: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { tag: "he", name: "Hebrew", nativeName: "עברית", rtl: true },
  { tag: "fa", name: "Persian", nativeName: "فارسی", rtl: true },
];

export const isRtlLanguage = (tag: LanguageTag): boolean => {
  const language = LANGUAGES.find(l => l.tag === tag);

  return language?.rtl ?? false;
};

const SUPPORTED_LANGUAGE_TAGS = new Set(LANGUAGES.map(l => l.tag));

export const detectBrowserLanguage = (): LanguageTag => {
  if (typeof navigator === "undefined") return "en";

  const languages = navigator.languages || [navigator.language];

  for (const browserLang of languages) {
    const lang = browserLang.toLowerCase();

    // Exact match
    if (SUPPORTED_LANGUAGE_TAGS.has(lang as LanguageTag)) {
      return lang as LanguageTag;
    }

    // Check for zh-cn variants (zh, zh-hans, zh-cn)
    if (
      lang === "zh"
      || lang.startsWith("zh-hans")
      || lang.startsWith("zh-cn")
    ) {
      return "zh-cn";
    }

    // Base language match (e.g., "en-US" -> "en")
    const [baseLang] = lang.split("-", 1);

    if (SUPPORTED_LANGUAGE_TAGS.has(baseLang as LanguageTag)) {
      return baseLang as LanguageTag;
    }
  }

  return "en";
};

export const getLanguageScore = (tag: string): number => {
  if (typeof navigator === "undefined") return 0;

  const languages = navigator.languages || [navigator.language];

  for (let index = 0; index < languages.length; index++) {
    const browserLang = languages[index].toLowerCase();

    // Exact match
    if (browserLang === tag) return languages.length - index + 1;

    // Prefix match (e.g., "en-US" matches "en")
    if (browserLang.startsWith(`${tag}-`) || tag.startsWith(`${browserLang}-`))
      return languages.length - index;

    // Base language match (e.g., "zh" matches "zh-cn")
    const [baseLang] = browserLang.split("-", 1);

    if (baseLang === tag || tag.startsWith(`${baseLang}-`))
      return languages.length - index - 0.5;
  }

  return 0;
};

export type Translate = (
  key: string,
  parameters?: Readonly<Record<string, string | number>>,
) => string | JSX.Element;

export type Translations = Record<string, unknown>;

const resolveNestedValue = (
  source: Translations | null | undefined,
  key: string,
): unknown => {
  if (!source) return undefined;

  const segments = key.split(".").filter(Boolean);

  if (segments.length === 0) return undefined;

  let current: unknown = source;

  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const interpolate = (
  template: string,
  parameters?: Readonly<Record<string, string | number>>,
): string => {
  if (!parameters) return template;

  return template.replaceAll(
    /\{(\w+)\}/g,
    (matchText: string, key: string): string => {
      const value = parameters[key];

      return value === undefined ? matchText : String(value);
    },
  );
};

export const resolveTranslation = (parameters: {
  primary: Translations | undefined;
  fallback: Translations;
  key: string;
  params?: Readonly<Record<string, string | number>>;
}): string => {
  const fromPrimary = resolveNestedValue(parameters.primary, parameters.key);

  if (typeof fromPrimary === "string") {
    return interpolate(fromPrimary, parameters.params);
  }

  const fromFallback = resolveNestedValue(parameters.fallback, parameters.key);

  if (typeof fromFallback === "string") {
    return interpolate(fromFallback, parameters.params);
  }

  return parameters.key;
};

export type TranslationContextValue = {
  languageTag: Accessor<LanguageTag>;
  setLanguageTag: (languageTag: LanguageTag) => void;
  isLoadingLanguagePack: Accessor<boolean>;
  isRtl: Accessor<boolean>;
  t: Translate;
};

export const TranslationContext = createContext<
  TranslationContextValue | undefined
>(undefined);

const loadLanguagePack = async (
  languageTag: LanguageTag,
): Promise<Translations | undefined> =>
  match(languageTag)
    .with("en", () => Promise.resolve(undefined))
    .with("nl", async () => import("../../lang/nl.json").then(m => m.default))
    .with("es", async () => import("../../lang/es.json").then(m => m.default))
    .with("sv", async () => import("../../lang/sv.json").then(m => m.default))
    .with("fr", async () => import("../../lang/fr.json").then(m => m.default))
    .with("zh-cn", async () =>
      import("../../lang/zh-cn.json").then(m => m.default),
    )
    .with("ar", async () => import("../../lang/ar.json").then(m => m.default))
    .with("he", async () => import("../../lang/he.json").then(m => m.default))
    .with("fa", async () => import("../../lang/fa.json").then(m => m.default))
    .exhaustive();

export const TranslationProvider: ParentComponent = (properties) => {
  const { provider } = useModalContext();
  const initialLanguageTag = provider.storage.getSettings().language as LanguageTag | undefined;
  const [languageTag, setLanguageTag] = createSignal<LanguageTag>(
    initialLanguageTag ?? "en",
  );
  const [languagePack, setLanguagePack] = createSignal<
    Translations | undefined
  >(undefined);
  const [isLoadingLanguagePack, setIsLoadingLanguagePack] = createSignal(false);

  createEffect(() => {
    let isCancelled = false;

    const run = async () => {
      setIsLoadingLanguagePack(true);

      try {
        const nextPack = await loadLanguagePack(languageTag());

        if (isCancelled) return;

        setLanguagePack(nextPack);
      }
      finally {
        if (!isCancelled) setIsLoadingLanguagePack(false);
      }
    };

    void run();

    onCleanup(() => {
      isCancelled = true;
    });
  });

  const t: Translate = (key, parameters) => {
    const translated = resolveTranslation({
      primary: languagePack(),
      fallback: fallbackEnglish as unknown as Translations,
      key,
      params: parameters,
    });
    const lines = translated.split("\n");

    if (lines.length <= 1) {
      return translated;
    }

    return (
      <>
        {lines.map((line, index) => (
          <>
            {line}
            {index < lines.length - 1 ? <br /> : null}
          </>
        ))}
      </>
    );
  };

  const isRtl = createMemo(() => isRtlLanguage(languageTag()));
  const updateLanguageTag = (nextLanguageTag: LanguageTag) => {
    setLanguageTag(nextLanguageTag);
  };

  const contextValue: TranslationContextValue = {
    languageTag,
    setLanguageTag: updateLanguageTag,
    isLoadingLanguagePack,
    isRtl,
    t,
  };

  return (
    <TranslationContext.Provider value={contextValue}>
      {properties.children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error("TranslationProvider not found");
  }

  return context;
};
