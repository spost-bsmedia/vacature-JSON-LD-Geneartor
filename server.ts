import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// Initialize Gemini SDK with User-Agent telemetry headers
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Helper for retrying content generation when model experiences high demand (503 / UNAVAILABLE)
async function generateContentWithRetry(aiInstance: GoogleGenAI, params: any, retries = 3, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await aiInstance.models.generateContent(params);
    } catch (e: any) {
      const errorMsg = e.message || "";
      const is503 = e.status === 503 || 
                    e.status === "UNAVAILABLE" ||
                    errorMsg.includes("503") || 
                    errorMsg.includes("UNAVAILABLE") ||
                    errorMsg.includes("high demand");
      if (is503 && i < retries - 1) {
        console.warn(`[GEMINI RETRY] Gemini is busy (503). Retrying in ${delayMs}ms... Attempt ${i + 1}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // exponential backoff
        continue;
      }
      throw e;
    }
  }
}

// JSON-LD Generation endpoint
app.post("/api/generate-jsonld", async (req, res) => {
  try {
    const { jobText, currentDate } = req.body;

    if (!jobText || typeof jobText !== "string" || !jobText.trim()) {
      return res.status(400).json({ error: "Vacature tekst is verplicht." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API-sleutel is niet ingesteld op de server. Configureer deze via Secrets."
      });
    }

    const todayStr = currentDate || new Date().toISOString().split("T")[0];

    const prompt = `Je krijgt een vacaturetekst in het Nederlands of Engels. Je taak is om alle relevante velden te extraheren voor de Google JobPosting structured data (JSON-LD) specificatie.
Wees zeer nauwkeurig en behoud details uit de tekst.

Huidige datum vandaag: ${todayStr}

Extraction Instructies:
1. "title": De exacte functietitel.
2. "company": De naam van de werkgever/organisatie. Zoek goed in de tekst (bijvoorbeeld 'Koopman International', 'Amsterdam', etc.).
3. "descriptionHtml": Een volledige, goed leesbare omschrijving geformatteerd in HTML. Gebruik uitsluitend veilige tags die Google accepteert voor JobPosting descriptions: <p>, <ul>, <li>, <strong>, <em>, <br>. Behoud alle belangrijke onderdelen zoals taken, vereisten en wat de werkgever biedt.
4. "employmentTypes": Een lijst van dienstverband typen. Selecteer uitsluitend uit: FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY, INTERN, VOLUNTEER, OTHER. Match zorgvuldig (bijv. "Fulltime" -> FULL_TIME, "Parttime" -> PART_TIME).
5. "locality": De stad of plaatsnaam waar de functie is gevestigd (bijv. "Amsterdam", "Emmeloord").
6. "region": De provincie of regio indien bekend (bijv. "Flevoland", "Noord-Holland"), anders leeg laten.
7. "postalCode": Postcode indien expliciet genoemd, anders leeg laten.
8. "streetAddress": Straatnaam en huisnummer indien vermeld, anders leeg laten.
9. "countryCode": De ISO 2-letter landcode (bijv. "NL", "BE"). Standaard is "NL" voor Nederlandse vacatures tenzij anders aangegeven.
10. "remoteType": Indien er sprake is van thuiswerk, kies uit: ONSITE (standaard), HYBRID of REMOTE.
11. "salaryMinimum": Het minimum salaris als getal (bijvoorbeeld 2500 voor €2500 per maand uur of jaar), anders 0.
12. "salaryMaximum": Het maximum salaris als getal, anders 0.
13. "salaryCurrency": De valuta, bijvoorbeeld "EUR" of "USD". Standaard is "EUR".
14. "salaryUnit": De frequentie van betaling: HOUR, WEEK, MONTH, of YEAR. Standaard is MONTH.
15. "datePosted": De publicatiedatum in YYYY-MM-DD. Gebruik de huidige datum "${todayStr}" als de publicatiedatum niet expliciet in de tekst staat.
16. "validThrough": De vervaldatum van de vacature in YYYY-MM-DD. Als deze niet is vermeld, kies dan een logische datum precies 90 dagen na datePosted.

Vacaturetekst:
"""
${jobText}
"""`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Exact status title of the job" },
            company: { type: Type.STRING, description: "Company brand or hiring organization name" },
            descriptionHtml: { type: Type.STRING, description: "HTML formatted job description with p, ul, li, strong, br tags. Translate newline breaks into standard structured tags properly. Do not include markdown codeblocks inside this HTML string." },
            employmentTypes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Allowed items: FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY, INTERN, VOLUNTEER, OTHER"
            },
            locality: { type: Type.STRING, description: "City / village name of job location" },
            region: { type: Type.STRING, description: "State, province or region" },
            postalCode: { type: Type.STRING, description: "Zip or postal code of the company office" },
            streetAddress: { type: Type.STRING, description: "Street and number of office location" },
            countryCode: { type: Type.STRING, description: "Two-letter country code, default to NL unless there's evidence otherwise" },
            remoteType: { type: Type.STRING, description: "ONSITE, HYBRID, or REMOTE" },
            salaryMinimum: { type: Type.NUMBER, description: "Minimum basic payment number, 0 if not present" },
            salaryMaximum: { type: Type.NUMBER, description: "Maximum basic payment number, 0 if not present" },
            salaryCurrency: { type: Type.STRING, description: "Currency like EUR or USD, default EUR" },
            salaryUnit: { type: Type.STRING, description: "Payment period element: HOUR, WEEK, MONTH or YEAR" },
            datePosted: { type: Type.STRING, description: "Posting date as YYYY-MM-DD" },
            validThrough: { type: Type.STRING, description: "Expiration date as YYYY-MM-DD" },
          },
          required: ["title", "company", "descriptionHtml", "employmentTypes", "locality", "countryCode", "datePosted", "validThrough"]
        }
      }
    });

    if (!response) {
      throw new Error("Geen antwoord ontvangen van Gemini.");
    }

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Geen antwoord ontvangen van Gemini.");
    }

    const jobData = JSON.parse(textOutput.trim());
    res.json(jobData);
  } catch (error: any) {
    console.error("Fout bij genereren van JSON-LD:", error);
    res.status(500).json({ error: error.message || "Interne fout bij het verwerken van de vacature." });
  }
});

async function startServer() {
  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server gestart op http://localhost:${PORT}`);
  });
}

startServer();
