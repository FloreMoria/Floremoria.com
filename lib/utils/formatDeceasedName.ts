/**
 * Helper universale di formattazione per i nomi dei defunti in FloreMoria.
 *
 * Regole:
 * 1. Formato standard tassativo: [Nome] [Cognome] (es. "Mario Rossi", "Giuseppe De Luca")
 * 2. Inversione automatica se l'input arriva come "ROSSI MARIO", "Rossi, Mario", o con particelle nobiliari/cognome prima.
 * 3. Title Case accurato con gestione di apostrofi (es. "D'Angelo", "Sant'Elia", "Dell'Acqua") e trattini (es. "Maria-Teresa").
 * 4. Supporto flessibile a input stringa singola ('fullName') o due campi ('firstName', 'lastName') o oggetto ordine.
 * 5. Gestione sicura e tollerante di valori nulli, vuoti o non definiti.
 */

// Prefissi / particelle comuni nei cognomi italiani
const SURNAME_PARTICLES = new Set([
    'de',
    'del',
    'della',
    'delle',
    'degli',
    'dei',
    'di',
    'da',
    'dal',
    'dalla',
    'dalle',
    'dello',
    'san',
    'santa',
    'sant',
    'lo',
    'la',
    'li',
]);

// Set ottimizzato dei nomi propri italiani più diffusi per riconoscimento inversione Cognome Nome
const ITALIAN_FIRST_NAMES = new Set([
    'mario', 'luigi', 'giovanni', 'giuseppe', 'francesco', 'antonio', 'paolo', 'roberto', 'andrea',
    'alessandro', 'marco', 'luca', 'matteo', 'davide', 'simone', 'federico', 'lorenzo', 'gabriele',
    'mattia', 'leonardo', 'riccardo', 'tommaso', 'edoardo', 'filippo', 'michele', 'pietro', 'salvatore',
    'vincenzo', 'domenico', 'angelo', 'carmine', 'pasquale', 'massimo', 'stefano', 'claudio', 'giorgio',
    'maurizio', 'fabrizio', 'gianluca', 'giancarlo', 'gianfranco', 'gianpaolo', 'gianmarco', 'gianmaria',
    'pierluigi', 'pierpaolo', 'carlo', 'enrico', 'alberto', 'sergio', 'bruno', 'franco', 'guido',
    'walter', 'valerio', 'cesare', 'diego', 'fabio', 'daniele', 'emanuele', 'manuel', 'samuele',
    'elia', 'jacopo', 'nicola', 'niccolo', 'niccolò', 'nicolo', 'nicolò', 'giacomo', 'raffaele',
    'renato', 'rosario', 'gaetano', 'alfonso', 'emilio', 'aldo', 'silvano', 'luciano', 'adriano',
    'danilo', 'ivan', 'dario', 'cristiano', 'flavio', 'gianni', 'dino', 'rino', 'enzo', 'ciro',
    'vito', 'eros', 'remo', 'tiziano', 'mirco', 'mirko', 'primo', 'secondo', 'terzo', 'nello',
    'ugo', 'gino', 'ivo', 'livio', 'mauro', 'renzo', 'ezio', 'italo', 'attilio', 'lino', 'arturo',
    'aurelio', 'corrado', 'costantino', 'fausto', 'felice', 'ferdinando', 'fernando', 'fiorenzo',
    'fortunato', 'fulvio', 'gaspare', 'gavino', 'gerardo', 'germano', 'giampiero', 'gilberto',
    'gioacchino', 'giordano', 'giuliano', 'giulio', 'graziano', 'gregorio', 'guglielmo', 'gustavo',
    'ignazio', 'ilario', 'innocenzo', 'leandro', 'leone', 'libero', 'loris', 'lucio', 'manlio',
    'marcello', 'mariano', 'marino', 'marzio', 'medardo', 'michelangelo', 'moreno', 'nazzareno',
    'nino', 'norberto', 'nunzio', 'oliviero', 'omero', 'onofrio', 'oreste', 'orlando', 'osvaldo',
    'otello', 'ottavio', 'ottorino', 'ovidio', 'palmiro', 'paride', 'patrizio', 'pellegrino',
    'pierangelo', 'piergiorgio', 'piero', 'pinuccio', 'pio', 'placido', 'pompeo', 'quirino',
    'raffaello', 'raimondo', 'raniero', 'raul', 'rinaldo', 'rocco', 'rodolfo', 'rolando', 'romano',
    'romeo', 'romolo', 'ruggero', 'sabatino', 'sabino', 'salvo', 'sandro', 'santo', 'santino',
    'saverio', 'sebastiano', 'severino', 'silverio', 'silvestro', 'silvio', 'sisto', 'tancredi',
    'tarcisio', 'teodoro', 'tito', 'ubaldo', 'umberto', 'urbano', 'valentino', 'valter', 'vasco',
    'venanzio', 'vinicio', 'virgilio', 'vittorio', 'zaccaria', 'christian', 'cristian', 'alex',

    'maria', 'anna', 'francesca', 'chiara', 'sara', 'laura', 'elena', 'silvia', 'federica',
    'giulia', 'martina', 'giorgia', 'valentina', 'elisa', 'alessia', 'alice', 'beatrice', 'sofia',
    'aurora', 'ginevra', 'emma', 'greta', 'vittoria', 'camilla', 'nicole', 'ludovica', 'noemi',
    'matilde', 'bianca', 'eleonora', 'irene', 'caterina', 'marta', 'serena', 'roberta', 'simona',
    'paola', 'claudia', 'cristina', 'daniela', 'monica', 'barbara', 'stefania', 'cinzia', 'antonella',
    'patrizia', 'teresa', 'rosa', 'carmela', 'angela', 'rita', 'lucia', 'giuseppina', 'giovanna',
    'vincenza', 'concetta', 'domenica', 'grazia', 'immacolata', 'assunta', 'rosaria', 'luisa',
    'carla', 'annamaria', 'mariaelena', 'mariangela', 'marianna', 'marilena', 'marina', 'marisa',
    'marzia', 'michela', 'milena', 'mirella', 'nadia', 'nicoletta', 'norma', 'ornella', 'pamela',
    'piera', 'pierina', 'rachele', 'renata', 'rina', 'romana', 'rosalba', 'rosalia', 'rosanna',
    'rossana', 'rossella', 'sabina', 'sabrina', 'sandra', 'santa', 'santina', 'silvana',
    'simonetta', 'sonia', 'susanna', 'tamara', 'tania', 'tatiana', 'tiziana', 'valeria',
    'vanda', 'vanessa', 'vera', 'veronica', 'vilma', 'viola', 'virginia', 'viviana', 'wanda',
    'zaira', 'adele', 'adriana', 'agata', 'agnese', 'alba', 'alberta', 'alessandra', 'amalia',
    'amanda', 'anita', 'annarosa', 'annita', 'antonietta', 'arianna', 'armida', 'augusta',
    'aurelia', 'azzurra', 'benedetta', 'berta', 'bruna', 'brunella', 'candida', 'carlotta',
    'carmen', 'carolina', 'cecilia', 'celeste', 'cesira', 'clara', 'clarissa', 'claudia',
    'clementina', 'clotilde', 'corinna', 'costanza', 'cristiana', 'dalila', 'danila', 'daria',
    'debora', 'deborah', 'delia', 'denise', 'diana', 'dina', 'donata', 'donatella', 'dora',
    'dorotea', 'edda', 'edvige', 'elda', 'elga', 'eliana', 'elisabetta', 'elsa', 'elvira',
    'emanuela', 'emilia', 'emiliana', 'enrica', 'erika', 'erminia', 'ersilia', 'ester',
    'eugenia', 'eva', 'fabiola', 'fatima', 'faustina', 'fedora', 'felicita', 'fernanda',
    'fiamma', 'filippa', 'filomena', 'fiora', 'fiorella', 'fiorenza', 'flora', 'franca',
    'fulvia', 'gabriella', 'gaetana', 'gemma', 'gelsomina', 'giada', 'gigliola', 'gilda',
    'gina', 'gioia', 'giordana', 'gisella', 'giuliana', 'giuseppa', 'giustina', 'gloria',
    'graziella', 'guendalina', 'ida', 'ilaria', 'ilda', 'imelda', 'ines', 'irma', 'isa',
    'isabella', 'isotta', 'italia', 'ivana', 'lara', 'lavinia', 'leda', 'leila', 'lelia',
    'lena', 'letizia', 'lia', 'liana', 'licia', 'lidia', 'liliana', 'lina', 'linda',
    'lisa', 'livia', 'loredana', 'lorella', 'lorena', 'lorenza', 'loretta', 'luciana',
    'lucilla', 'lucrezia', 'luigia', 'maddalena', 'mafalda', 'magda', 'manuela', 'mara',
    'marcella', 'margherita', 'mariantonietta',
]);

/**
 * Capitalizza una singola parola/token rispettando apostrofi interni (es. D'Angelo, Sant'Elia)
 * e trattini (es. Maria-Teresa, Jean-Paul).
 */
export function capitalizeWord(word: string): string {
    if (!word) return '';

    // Se contiene trattini, capitalizza ogni segmento separato
    if (word.includes('-')) {
        return word
            .split('-')
            .map((part) => capitalizeWord(part))
            .join('-');
    }

    // Se contiene apostrofi (standard ' o tipografico ’ o `)
    const normalizedApostrophe = word.replace(/[`’]/g, "'");
    if (normalizedApostrophe.includes("'")) {
        const parts = normalizedApostrophe.split("'");
        return parts
            .map((part, index) => {
                if (!part) return '';
                const lower = part.toLowerCase();
                if (index === 0) {
                    if (lower === 'd' || lower === 'l' || lower === 'un') {
                        return lower.toUpperCase();
                    }
                    if (lower === 'sant' || lower === 'dell' || lower === 'all') {
                        return lower.charAt(0).toUpperCase() + lower.slice(1);
                    }
                }
                return lower.charAt(0).toUpperCase() + lower.slice(1);
            })
            .join("'");
    }

    const lower = word.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Esegue il Title Case di una stringa con gestione delle particelle nobiliari/cognominali.
 */
export function toDeceasedTitleCase(raw: string): string {
    if (!raw) return '';
    const tokens = raw.trim().split(/\s+/);
    if (!tokens.length) return '';

    return tokens
        .map((token, index) => {
            const lower = token.toLowerCase();
            if (SURNAME_PARTICLES.has(lower) && index > 0) {
                return lower.charAt(0).toUpperCase() + lower.slice(1);
            }
            return capitalizeWord(token);
        })
        .join(' ');
}

export type DeceasedNameInput =
    | string
    | null
    | undefined
    | {
          firstName?: string | null;
          lastName?: string | null;
          fullName?: string | null;
          deceasedName?: string | null;
          name?: string | null;
      };

/**
 * Funzione principale universale per formattare i nominativi dei defunti.
 *
 * @param input Stringa o oggetto contenente i campi del defunto
 * @param fallback Valore di fallback se l'input è vuoto (default '')
 * @returns Nominativo formattato in formato standard "Nome Cognome" (es. "Mario Rossi")
 */
export function formatDeceasedName(
    input: DeceasedNameInput,
    fallback: string = ''
): string {
    if (!input) return fallback;

    // Caso 1: Input ad oggetto
    if (typeof input === 'object') {
        const fn = (input.firstName || '').trim();
        const ln = (input.lastName || '').trim();
        if (fn || ln) {
            const combined = [fn, ln].filter(Boolean).join(' ');
            return formatDeceasedName(combined, fallback);
        }

        const alt = input.fullName || input.deceasedName || input.name;
        if (alt) {
            return formatDeceasedName(alt, fallback);
        }
        return fallback;
    }

    let raw = String(input).trim();
    if (!raw) return fallback;

    // Pulisci prefissi comuni come "Fu", "Defunto:", "In memoria di:", "Sig.", "Sig.ra"
    raw = raw
        .replace(/^(?:in\s+memoria\s+di\s*:?|defunto\s*:?|defunta\s*:?|fu\s+|sig\.?r?a?\.?\s*)/i, '')
        .trim();

    // Rimuovi caratteri di punteggiatura non alfabetici iniziali/finali
    raw = raw.replace(/^[:"'«“—–\-\s]+|[:"'»”—–\-\s]+$/g, '').trim();

    // 1. Riconoscimento formato con virgola: "Cognome, Nome" (es. "Rossi, Mario", "De Luca, Giuseppe")
    if (raw.includes(',')) {
        const [partA, partB] = raw.split(',').map((p) => p.trim());
        if (partA && partB) {
            const inverted = `${partB} ${partA}`;
            return toDeceasedTitleCase(inverted);
        }
    }

    const words = raw.split(/\s+/);
    if (words.length <= 1) {
        return toDeceasedTitleCase(raw);
    }

    // 2. Riconoscimento inversione a 2 parole: "COGNOME NOME" (es. "ROSSI MARIO")
    if (words.length === 2) {
        const [w1, w2] = words;
        const w1Lower = w1.toLowerCase().replace(/['`]/g, '');
        const w2Lower = w2.toLowerCase().replace(/['`]/g, '');

        const w1IsFirst = ITALIAN_FIRST_NAMES.has(w1Lower);
        const w2IsFirst = ITALIAN_FIRST_NAMES.has(w2Lower);

        // Se la seconda parola è un nome proprio noto e la prima NON lo è
        if (w2IsFirst && !w1IsFirst) {
            return toDeceasedTitleCase(`${w2} ${w1}`);
        }

        return toDeceasedTitleCase(`${w1} ${w2}`);
    }

    // 3. Riconoscimento inversione con particelle cognominali:
    // es. "DE LUCA GIUSEPPE" -> "GIUSEPPE DE LUCA"
    // es. "DEL VECCHIO ANTONIO" -> "ANTONIO DEL VECCHIO"
    if (words.length >= 3) {
        const firstWordLower = words[0].toLowerCase().replace(/['`]/g, '');
        const lastWordLower = words[words.length - 1].toLowerCase().replace(/['`]/g, '');

        // Se la prima parola è una particella cognominale (es. "De", "Di", "Del") e l'ultima parola è un nome
        if (SURNAME_PARTICLES.has(firstWordLower) && ITALIAN_FIRST_NAMES.has(lastWordLower)) {
            const firstName = words[words.length - 1];
            const surname = words.slice(0, words.length - 1).join(' ');
            return toDeceasedTitleCase(`${firstName} ${surname}`);
        }

        // Se le prime 2 parole formano un cognome composto e la 3a è un nome (es. "ROSSI BIANCHI MARIO")
        const secondWordLower = words[1].toLowerCase().replace(/['`]/g, '');
        if (
            !ITALIAN_FIRST_NAMES.has(firstWordLower) &&
            !ITALIAN_FIRST_NAMES.has(secondWordLower) &&
            ITALIAN_FIRST_NAMES.has(lastWordLower)
        ) {
            const firstName = words[words.length - 1];
            const surname = words.slice(0, words.length - 1).join(' ');
            return toDeceasedTitleCase(`${firstName} ${surname}`);
        }
    }

    return toDeceasedTitleCase(raw);
}
