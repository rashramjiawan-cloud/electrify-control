import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileName, fileSize, hexPreview: rawHex, chargePointInfo, mode, followUp, conversationHistory } = await req.json();
    // Truncate hex to max ~8KB to stay within token limits
    const MAX_HEX_CHARS = 8000;
    const hexPreview = typeof rawHex === 'string' && rawHex.length > MAX_HEX_CHARS
      ? rawHex.slice(0, MAX_HEX_CHARS) + `\n... (afgekapt, ${rawHex.length} tekens totaal)`
      : rawHex;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt: string;

    if (mode === "decode" || mode === "followup") {
      systemPrompt = `Je bent een embedded systems firmware reverse-engineering expert, gespecialiseerd in EV-laadpalen (Ecotap EVC/ECC controllers, OCPP 1.6).

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
    } else {
      systemPrompt = `Je bent een firmware-analyse expert voor EV-laadpalen (OCPP). Analyseer het firmware-bestand op basis van de bestandsnaam, grootte en hex-preview.

Geef een gestructureerde analyse in het Nederlands met:
1. **Bestandstype**: Wat voor soort firmware-bestand
2. **Formaat**: Herken het bestandsformaat uit de magic bytes
3. **Versie-indicatie**: Versienummer uit bestandsnaam
4. **Compatibiliteit**: Voor welke laadpalen geschikt
5. **Risico-beoordeling**: Risico's bij flashen
6. **Aanbevelingen**: Tips voor veilig updaten

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
