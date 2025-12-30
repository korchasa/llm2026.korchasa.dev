export const DEFAULT_LANG = 'en';

export const LANGUAGES = {
    'en': {
        name: 'English',
        system: `You are a professional New Year greeting generator.
Output ONLY the greeting text in the specified language.
No headings, no meta-talk, no surrounding quotes. Do NOT use <think> tags or output internal reasoning.`,
        styles: {
            warm: "warm, soulful, and family-oriented",
            poetic: "imaginative, metaphorical, and beautiful",
            inspirational: "inspiring for new achievements and victories",
            "tech-positive": "with a touch of future, technology and progress",
            cozy: "cozy, like a warm blanket and cocoa",
            funny: "lightly funny, witty and cheerful"
        },
        userTemplate: (year, styleDesc, avoid) => `Write ONE unique New Year greeting for the year ${year}.
Target Language: English.
Style: ${styleDesc}.
Length: 3-5 sentences.
Requirements: Avoid clichés. Focus on the atmosphere, calmness, and the joy of the moment.
${avoid ? `Do not repeat the following themes/phrases: ${avoid}.` : ""}
Final instruction: Output only the greeting text in English.`
    },
    'ru': {
        name: 'Russian',
        system: "Ты профессиональный генератор новогодних тостов. Пиши ТОЛЬКО текст тоста, без пояснений и кавычек.",
        styles: {
            warm: "душевное, теплое и семейное",
            poetic: "образное, поэтичное и красивое",
            inspirational: "вдохновляющее на новые свершения",
            "tech-positive": "технологичное, про будущее и прогресс",
            cozy: "уютное, как теплый плед и какао",
            funny: "остроумное, веселое и легкое"
        },
        userTemplate: (year, styleDesc, avoid) => `Напиши ОДНО уникальное новогоднее поздравление на ${year} год.
Язык: Русский. Стиль: ${styleDesc}. Длина: 3-5 предложений.
Избегай избитых клише. Сфокусируйся на атмосфере и радости момента.
${avoid ? `Не повторяй эти фразы: ${avoid}.` : ""}
Важно: Выведи только текст поздравления.`
    },
    'uk': {
        name: 'Ukrainian',
        system: "Ти професійний генератор новорічних привітань. Пиши ТІЛЬКИ текст привітання, без пояснень та лапок. ЗАБОРОНЕНО використовувати тег <think> та виводити внутрішні міркування.",
        styles: {
            warm: "душевне, тепле та сімейне",
            poetic: "образне, поетичне та красиве",
            inspirational: "що надихає на нові звершення",
            "tech-positive": "технологічне, про майбутнє та прогрес",
            cozy: "затишне, як теплий плед та какао",
            funny: "дотепне, веселе та легке"
        },
        userTemplate: (year, styleDesc, avoid) => `Напиши ОДНЕ унікальне новорічне привітання на ${year} рік.
Мова: Українська. Стиль: ${styleDesc}. Длина: 3-5 речень.
Уникай заїжджених кліше. Зосередься на атмосфері та радості моменту.
${avoid ? `Не повторюй ці фрази: ${avoid}.` : ""}
Важно: Виведи тільки текст привітання.`
    },
    'bg': {
        name: 'Bulgarian',
        system: "Ти си професионален генератор на новогодишни поздрави. Пиши САМО текста на поздрава, без обяснения и кавички. ЗАБРАНЕНО е използването на тага <think> и извеждането на вътрешни разсъждения.",
        styles: {
            warm: "душевно, топло и семейно",
            poetic: "образно, поетично и красиво",
            inspirational: "вдъхновяващо за нови постижения",
            "tech-positive": "технологично, за бъдещето и прогреса",
            cozy: "уютно, като топло одеяло и какао",
            funny: "остроумно, весело и леко"
        },
        userTemplate: (year, styleDesc, avoid) => `Напиши ЕДИН уникален новогодишен поздрав за ${year} година.
Език: Български. Стил: ${styleDesc}. Дължина: 3-5 изречения.
Избягвай изтъркани клишета. Фокусирай се върху атмосферата и радостта от момента.
${avoid ? `Не повтаряй тези фрази: ${avoid}.` : ""}
Важно: Изведи само текста на поздрава.`
    },
    'es': { name: 'Spanish' },
    'fr': { name: 'French' },
    'de': { name: 'German' },
    'it': { name: 'Italian' },
    'pt': { name: 'Portuguese' },
    'zh': { name: 'Chinese' },
    'ja': { name: 'Japanese' },
    'ko': { name: 'Korean' }
};
