import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileName, fileSize, hexPreview: rawHex, chargePointInfo, mode, followUp, conversationHistory, fileNameA, fileNameB, fileSizeA, fileSizeB, labelA, labelB, stats, diffSummary } = await req.json();
    // Truncate hex to max ~8KB to stay within token limits
    const MAX_HEX_CHARS = 8000;
    const hexPreview = typeof rawHex === 'string' && rawHex.length > MAX_HEX_CHARS
      ? rawHex.slice(0, MAX_HEX_CHARS) + `\n... (afgekapt, ${rawHex.length} tekens totaal)`
      : rawHex;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt: string;

    if (mode === "compare") {
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
      systemPrompt = `Je bent een embedded systems firmware reverse-engineering expert, gespecialiseerd in EV-laadpalen (Ecotap EVC/ECC controllers, OCPP 1.6).
// ... keep existing code
Gebruik tabellen en code-blokken voor duidelijkheid. Wees zo specifiek mogelijk over offsets en waarden.`;
    } else {
      systemPrompt = `Je bent een firmware-analyse expert voor EV-laadpalen (OCPP). Analyseer het firmware-bestand op basis van de bestandsnaam, grootte en hex-preview.
// ... keep existing code
Houd het beknopt maar informatief.`;
    }

    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory);
    }

    if (mode === "followup" && followUp) {
      messages.push({
        role: "user",
        content: `Vervolgvraag over de firmware "${fileName}" (${fileSize} bytes):

${followUp}

Originele hex preview:
${hexPreview}`,
      });
    } else {
      const userContent = `Firmware bestand: ${fileName}
Grootte: ${fileSize} bytes
${chargePointInfo ? `Laadpaal context: ${chargePointInfo}` : ""}

Hex preview (eerste 512 bytes):
${hexPreview}`;
      messages.push({ role: "user", content: userContent });
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

    // Parse next steps from the analysis
    const nextSteps: { title: string; description: string }[] = [];
    const stepRegex = /^→\s*(.+?)\|(.+)$/gm;
    let match;
    while ((match = stepRegex.exec(analysis)) !== null) {
      nextSteps.push({ title: match[1].trim(), description: match[2].trim() });
    }

    return new Response(JSON.stringify({ analysis, nextSteps }), {
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
