// All Polish UI strings (PRD §4.6, §4.7, §6, §9, §11.6, §11.8).
// Isomorphic: used by client components and by the server, so no React or server-only imports.

export const pl = {
  form: {
    title: "Zwrot lub reklamacja sprzętu",
    intro: "Wypełnij formularz i dodaj zdjęcie, a po wysłaniu zgłoszenia otrzymasz wstępną decyzję.",
    labels: {
      caseType: "Typ zgłoszenia",
      category: "Kategoria sprzętu",
      modelName: "Nazwa modelu",
      purchaseDate: "Data zakupu",
      photo: "Zdjęcie",
    },
    reasonLabel: {
      COMPLAINT: "Opis problemu",
      RETURN: "Powód zwrotu (opcjonalnie)",
    },
    categoryPlaceholder: "Wybierz kategorię",
    modelPlaceholder: "np. Samsung Galaxy S24",
    photoHint: {
      RETURN: "Zrób zdjęcie całego urządzenia, aby było widać, że nie jest uszkodzone ani używane.",
      COMPLAINT: "Zrób zdjęcie, na którym wyraźnie widać uszkodzenie lub usterkę.",
    },
    chooseFile: "Wybierz plik",
    removeFile: "Usuń",
    submit: "Wyślij zgłoszenie",
  },
  validation: {
    REQUIRED: "To pole jest wymagane",
    TOO_SHORT: "Opisz problem (min. 20 znaków)",
    TOO_LONG: "Przekroczono maksymalną liczbę znaków",
    FUTURE_DATE: "Data zakupu nie może być z przyszłości",
    UNSUPPORTED_FORMAT: "Dozwolone formaty: JPG, PNG, WebP",
    FILE_TOO_LARGE: "Plik przekracza limit 10 MB",
    INVALID_ENUM: "Wybierz wartość z listy",
    MULTIPLE_FILES: "Dodaj tylko jedno zdjęcie",
  },
  processing: {
    analyzingImage: "Analizujemy zdjęcie…",
    preparingDecision: "Przygotowujemy decyzję…",
  },
  errors: {
    processingBanner: "Nie udało się przetworzyć zgłoszenia. Spróbuj ponownie za chwilę.",
    sessionExpired: "Sesja wygasła. Rozpocznij nowe zgłoszenie.",
    chatFailed: "Nie udało się wysłać wiadomości.",
    retry: "Ponów",
  },
  chat: {
    send: "Wyślij",
    inputPlaceholder: "Napisz wiadomość…",
    limitReached:
      "Osiągnięto limit wiadomości w tym zgłoszeniu. Rozpocznij nowe zgłoszenie lub skontaktuj się ze sklepem, podając numer sprawy.",
    updatedDecisionTitle: "Zaktualizowana decyzja",
    updatingDecision: "Aktualizuję decyzję…",
    newCase: "Nowe zgłoszenie",
  },
  panel: {
    caseId: "Numer sprawy",
    caseType: "Typ zgłoszenia",
    category: "Kategoria",
    model: "Model",
    purchaseDate: "Data zakupu",
    reason: "Opis",
    showMore: "Pokaż więcej",
    showLess: "Pokaż mniej",
    status: "Status",
  },
  dialog: {
    newCaseMessage: "Bieżąca rozmowa zostanie zamknięta. Kontynuować?",
    confirm: "Kontynuuj",
    cancel: "Anuluj",
  },
  firstMessage: {
    greeting: "Dzień dobry!",
    headings: {
      decision: "Decyzja",
      justification: "Uzasadnienie",
      nextSteps: "Następne kroki",
      questions: "Pytania",
    },
    caseIdPrefix: "Numer sprawy:",
    disclaimer:
      "Ta decyzja jest wstępna i nie jest wiążąca. Ostateczną decyzję podejmuje sklep po fizycznym sprawdzeniu urządzenia. Nie ogranicza to Twoich ustawowych praw konsumenta.",
  },
} as const;

export type ValidationErrorCode = keyof typeof pl.validation;
