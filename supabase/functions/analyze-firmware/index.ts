import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { fileName, fileSize, hexPreview: rawHex, chargePointInfo, mode, followUp, conversationHistory, fileNameA, fileNameB, fileSizeA, fileSizeB, labelA, labelB, stats, diffSummary, editInstruction, hexContext, mergeInstructions, fileNames, fileSizes } = body;
    const MAX_HEX_CHARS = 8000;
    const hexPreview = typeof rawHex === 'string' && rawHex.length > MAX_HEX_CHARS
      ? rawHex.slice(0, MAX_HEX_CHARS) + `\n... (afgekapt, ${rawHex.length} tekens totaal)`
      : rawHex;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let messages: { role: string; content: string }[] = [];

    if (mode === "edit-patch") {
      // AI-gestuurde patches: gebruiker beschrijft wat hij wil veranderen
      const editPrompt = `Je bent een embedded systems firmware patch expert voor EV-laadpalen (Ecotap EVC/ECC, OCPP 1.6).

De gebruiker wil de firmware bewerken. Genereer exacte hex patches op basis van de instructie.

Firmware: ${fileName} (${fileSize} bytes)

BELANGRIJK: Geef je antwoord in het Nederlands, gestructureerd als:

## Patch Analyse

### Instructie
Herhaal kort wat de gebruiker wil bereiken.

### Gevonden locaties
Identificeer de relevante offsets in de hex dump.

### Voorgestelde patches
Geef EXACTE patches in dit formaat (één per regel):
\`\`\`patch
OFFSET: OUD_HEX -> NIEUW_HEX | Beschrijving
\`\`\`

Voorbeeld:
\`\`\`patch
0x00000A4: 2C 01 -> 58 02 | HeartbeatInterval van 300 naar 600 sec
0x00000B8: 3C 00 -> 78 00 | ConnectionTimeout van 60 naar 120 sec
\`\`\`

### Risico's
Beoordeel het risico van elke patch (laag/middel/hoog).

### Validatie
Hoe kan de gebruiker controleren of de patch correct is toegepast.

Wees EXTREEM voorzichtig en expliciet. Bij twijfel, geef aan dat handmatige verificatie nodig is.`;

      messages = [
        { role: "system", content: editPrompt },
        { role: "user", content: `Hex context:\n${hexContext || hexPreview}\n\nGewenste wijziging: ${editInstruction}` },
      ];
    } else if (mode === "extract-config") {
      const extractPrompt = `Je bent een embedded firmware configuratie-extractor voor EV-laadpalen (Ecotap EVC/ECC, OCPP 1.6).

Analyseer de hex dump en extraheer ALLE herkenbare configuratiewaarden. De hex dump bevat slim geselecteerde secties uit het HELE firmware bestand — niet alleen de header maar ook data-secties met hoge leesbaarheid (strings, configuratiewaarden).

Firmware: ${fileName} (${fileSize} bytes)

BELANGRIJK: Wees grondig! Zoek in ALLE aangeleverde secties naar parameters. Besteed extra aandacht aan secties met hoge leesbaarheidsscore — daar zitten vaak strings zoals URLs, IP-adressen, OCPP parameters, etc.

Geef je antwoord in het Nederlands als gestructureerde JSON gevolgd door uitleg:

## Geëxtraheerde Configuratie

\`\`\`json
{
  "parameters": [
    {
      "name": "parameter_naam",
      "value": "huidige_waarde",
      "offset": "0x00000000",
      "size_bytes": 2,
      "type": "uint16_le|uint32_le|string|float32_le|uint8|bool",
      "description": "Beschrijving van de parameter",
      "editable": true,
      "category": "OCPP|Network|Hardware|Security|Timing|Firmware|Calibration"
    }
  ]
}
\`\`\`

## Analyse
Geef context bij de gevonden parameters. Zoek GRONDIG naar:
1. **OCPP Parameters**: HeartbeatInterval, MeterValueSampleInterval, ConnectionTimeOut, MeterValuesSampledData, NumberOfConnectors, AuthorizationCacheEnabled, LocalPreAuthorize
2. **Netwerk**: IP-adressen, poorten, URLs (ws://, wss://, http://), APN instellingen, DNS servers, gateway adressen, MAC adressen
3. **Hardware**: Baudrates (9600, 19200, 38400, 57600, 115200), GPIO configuratie, ADC kalibratie, max stroom (Ampère), spanningslimieten
4. **Security**: Certificaat-locaties, encryptie-instellingen, wachtwoorden, API keys
5. **Timing**: Watchdog timers, polling intervals, retry timeouts, heartbeat intervals
6. **Strings**: Alle leesbare ASCII strings (firmware versie, model namen, foutmeldingen, menu teksten)
7. **Calibratie**: Meetwaarde-offsets, schaalfactoren, ADC referentiewaarden

Probeer MINSTENS 10-15 parameters te vinden. Als een parameter niet met zekerheid geïdentificeerd kan worden, markeer deze als \`"editable": false\` maar neem hem WEL op in de lijst.`;

      messages = [
        { role: "system", content: extractPrompt },
        { role: "user", content: `Smart hex dump (niet-lege secties uit het hele ${fileSize}-byte bestand):\n${hexPreview}` },
      ];
    } else if (mode === "merge") {
      // Binary merge/splice
      const mergePrompt = `Je bent een firmware binary merge expert voor EV-laadpalen (Ecotap EVC/ECC).

De gebruiker wil delen van meerdere firmware bestanden combineren.

Bestanden:
${(fileNames || []).map((n: string, i: number) => `- ${n} (${(fileSizes || [])[i] || '?'} bytes)`).join('\n')}

Geef je antwoord in het Nederlands:

## Merge Analyse

### Compatibiliteit
Analyseer of de bestanden compatibel zijn om te mergen (zelfde platform, zelfde geheugen-layout).

### Merge Plan
Beschrijf stap voor stap welke secties van welk bestand moeten worden gebruikt:

\`\`\`merge-plan
SECTIE: OFFSET_START - OFFSET_END | BRON_BESTAND | BESCHRIJVING
\`\`\`

### Header Aanpassingen
Welke header-velden moeten worden aangepast na de merge (checksums, grootte, etc.).

### Risico's
Uitgebreide risico-analyse van de merge operatie.

### Aanbevelingen
Concrete stappen om de gemergte firmware te valideren voordat deze wordt geflasht.

WAARSCHUWING: Binary merging is een risicovol proces. Wees expliciet over alle gevaren.`;

      messages = [
        { role: "system", content: mergePrompt },
        { role: "user", content: `Merge instructie: ${mergeInstructions}\n\nHex previews:\n${hexPreview}` },
      ];
    } else if (mode === "compare") {
      const comparePrompt = `Je bent een embedded systems firmware reverse-engineering expert, gespecialiseerd in EV-laadpalen (Ecotap EVC/ECC controllers, OCPP 1.6).

Vergelijk twee firmware bestanden en geef een gedetailleerde analyse van de verschillen.

Bestand A (oud): ${fileNameA} (${fileSizeA} bytes) - Label: ${labelA}
Bestand B (nieuw): ${fileNameB} (${fileSizeB} bytes) - Label: ${labelB}

Statistieken:
- Identieke regels: ${stats?.identical || 0}
- Gewijzigde regels: ${stats?.changed || 0}
- Toegevoegde regels: ${stats?.added || 0}
- Verwijderde regels: ${stats?.removed || 0}

Geef je analyse in het Nederlands. Structureer als:

## Vergelijkingsanalyse

### Samenvatting
Korte samenvatting van de update (1-2 zinnen)

### Significante wijzigingen
Analyseer de hex-diff en identificeer:
1. **Header/metadata wijzigingen**: Versienummers, checksums, build timestamps
2. **Code-segment wijzigingen**: Nieuwe/gewijzigde functies, interrupt handlers
3. **Configuratie wijzigingen**: OCPP parameters, netwerk instellingen
4. **Data-segment wijzigingen**: Lookup tables, calibratiedata

### Risico-beoordeling
Beoordeel het risico van deze update (laag/middel/hoog) met uitleg

### Aanbevelingen
Concrete aanbevelingen voor het toepassen van deze update

Diff van gewijzigde regels (offset: [TYPE] A: hex → B: hex):
${diffSummary}`;

      messages = [
        { role: "system", content: comparePrompt },
        { role: "user", content: "Analyseer de verschillen tussen deze twee firmware versies." },
      ];
    } else if (mode === "decode" || mode === "followup") {
      const systemPrompt = `Je bent een embedded systems firmware reverse-engineering expert, gespecialiseerd in EV-laadpalen (Ecotap EVC/ECC controllers, OCPP 1.6).

${mode === "followup" ? "De gebruiker stelt een vervolgvraag over een eerdere hex-analyse. Beantwoord deze specifiek en gedetailleerd." : "Analyseer de hex dump en decodeer de binaire structuur byte-voor-byte."}

Geef je analyse in het Nederlands. Structureer je antwoord als volgt:

## Analyse
[Je gedetailleerde analyse hier]

${mode !== "followup" ? `Behandel:
1. **Magic Bytes & Header**: Identificeer het bestandsformaat (ELF, ARM Cortex-M, Intel HEX, custom bootloader, etc.)
2. **Interrupt Vector Table**: Decodeer vector table entries met geheugen-adressen
3. **Geheugen Layout**: Code-segmenten, data-segmenten, stack pointer
4. **Strings & Configuratie**: Embedded strings, versienummers, OCPP parameters
5. **Checksums & CRC**: Checksum-velden en posities
6. **Processor Architectuur**: Target MCU (ARM Cortex-M0/M3/M4, LPC, STM32, etc.)
7. **Annotated Hex**: Geannoteerde versie van belangrijkste secties` : ""}

## Volgende stappen
Geef 2-4 concrete vervolgacties die de gebruiker kan uitvoeren. Elke actie op een eigen regel, beginnend met "→ " gevolgd door een korte actietitel en dan "|" en een beschrijving.
Voorbeeld formaat:
→ Analyseer interrupt handlers|Decodeer de functies achter de vector table adressen
→ Zoek OCPP configuratie|Scan naar embedded OCPP endpoint URLs en parameters
→ Vergelijk met bekende firmware|Check of dit bestand overeenkomt met bekende Ecotap releases
→ Extraheer embedded certificaten|Zoek naar TLS/SSL certificaten in de binary

Gebruik tabellen en code-blokken voor duidelijkheid. Wees zo specifiek mogelijk over offsets en waarden.`;

      messages = [{ role: "system", content: systemPrompt }];

      if (conversationHistory && Array.isArray(conversationHistory)) {
        messages.push(...conversationHistory);
      }

      if (mode === "followup" && followUp) {
        messages.push({
          role: "user",
          content: `Vervolgvraag over de firmware "${fileName}" (${fileSize} bytes):\n\n${followUp}\n\nOriginele hex preview:\n${hexPreview}`,
        });
      } else {
        messages.push({
          role: "user",
          content: `Firmware bestand: ${fileName}\nGrootte: ${fileSize} bytes\n${chargePointInfo ? `Laadpaal context: ${chargePointInfo}` : ""}\n\nHex preview (eerste 512 bytes):\n${hexPreview}`,
        });
      }
    } else {
      const systemPrompt = `Je bent een firmware-analyse expert voor EV-laadpalen (OCPP). Analyseer het firmware-bestand op basis van de bestandsnaam, grootte en hex-preview.

Geef een gestructureerde analyse in het Nederlands met:
1. **Bestandstype**: Wat voor soort firmware-bestand
2. **Formaat**: Herken het bestandsformaat uit de magic bytes
3. **Versie-indicatie**: Versienummer uit bestandsnaam
4. **Compatibiliteit**: Voor welke laadpalen geschikt
5. **Risico-beoordeling**: Risico's bij flashen
6. **Aanbevelingen**: Tips voor veilig updaten

Houd het beknopt maar informatief.`;

      messages = [{ role: "system", content: systemPrompt }];

      if (conversationHistory && Array.isArray(conversationHistory)) {
        messages.push(...conversationHistory);
      }

      messages.push({
        role: "user",
        content: `Firmware bestand: ${fileName}\nGrootte: ${fileSize} bytes\n${chargePointInfo ? `Laadpaal context: ${chargePointInfo}` : ""}\n\nHex preview (eerste 512 bytes):\n${hexPreview}`,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Geen credits meer. Voeg credits toe aan je workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI analyse mislukt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content || "Geen analyse beschikbaar.";

    const nextSteps: { title: string; description: string }[] = [];
    const stepRegex = /^→\s*(.+?)\|(.+)$/gm;
    let match;
    while ((match = stepRegex.exec(analysis)) !== null) {
      nextSteps.push({ title: match[1].trim(), description: match[2].trim() });
    }

    // Parse patches from edit-patch mode
    let patches: { offset: string; oldHex: string; newHex: string; description: string }[] = [];
    if (mode === "edit-patch") {
      const patchRegex = /^(0x[0-9A-Fa-f]+):\s*([0-9A-Fa-f\s]+)\s*->\s*([0-9A-Fa-f\s]+)\s*\|\s*(.+)$/gm;
      let pm;
      while ((pm = patchRegex.exec(analysis)) !== null) {
        patches.push({
          offset: pm[1].trim(),
          oldHex: pm[2].trim(),
          newHex: pm[3].trim(),
          description: pm[4].trim(),
        });
      }
    }

    // Parse config from extract-config mode
    let config = null;
    if (mode === "extract-config") {
      const jsonMatch = analysis.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          config = JSON.parse(jsonMatch[1]);
        } catch { /* ignore parse errors */ }
      }
    }

    return new Response(JSON.stringify({ analysis, nextSteps, patches, config }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-firmware error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
