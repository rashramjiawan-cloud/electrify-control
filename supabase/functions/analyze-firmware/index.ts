import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileName, fileSize, hexPreview, chargePointInfo, mode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt: string;

    if (mode === "decode") {
      systemPrompt = `Je bent een embedded systems firmware reverse-engineering expert, gespecialiseerd in EV-laadpalen (Ecotap EVC/ECC controllers, OCPP 1.6).

Analyseer de hex dump en decodeer de binaire structuur byte-voor-byte. Geef je analyse in het Nederlands:

1. **Magic Bytes & Header**: Identificeer het bestandsformaat uit de eerste bytes (ELF, ARM Cortex-M, Intel HEX, custom bootloader, etc.)
2. **Interrupt Vector Table**: Als aanwezig, decodeer de vector table entries (Reset, NMI, HardFault, etc.) met geheugen-adressen
3. **Geheugen Layout**: Identificeer code-segmenten, data-segmenten, stack pointer initialisatie
4. **Strings & Configuratie**: Vind embedded strings, versienummers, endpoints, OCPP parameters
5. **Checksums & CRC**: Identificeer checksum-velden en hun positie
6. **Processor Architectuur**: Identificeer de target MCU (ARM Cortex-M0/M3/M4, LPC, STM32, etc.)
7. **Annotated Hex**: Geef een geannoteerde versie van de belangrijkste secties met uitleg per byte-groep

Gebruik tabellen en code-blokken voor duidelijkheid. Wees zo specifiek mogelijk over offsets en waarden.`;
    } else {
      systemPrompt = `Je bent een firmware-analyse expert voor EV-laadpalen (OCPP). Analyseer het firmware-bestand op basis van de bestandsnaam, grootte en hex-preview (eerste bytes).

Geef een gestructureerde analyse in het Nederlands met:
1. **Bestandstype**: Wat voor soort firmware-bestand dit waarschijnlijk is (binary, compressed archive, etc.)
2. **Formaat**: Herken het bestandsformaat uit de magic bytes (ZIP, GZIP, ELF, PE, etc.)
3. **Versie-indicatie**: Als de bestandsnaam een versienummer bevat, benoem dit
4. **Compatibiliteit**: Op basis van de naam en context, voor welke laadpalen dit geschikt zou kunnen zijn
5. **Risico-beoordeling**: Mogelijke risico's bij het flashen van deze firmware
6. **Aanbevelingen**: Tips voor het veilig toepassen van de update

Houd het beknopt maar informatief.`;
    }

    const userContent = `Firmware bestand: ${fileName}
Grootte: ${fileSize} bytes
${chargePointInfo ? `Laadpaal context: ${chargePointInfo}` : ""}

Hex preview (eerste 512 bytes):
${hexPreview}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
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

    return new Response(JSON.stringify({ analysis }), {
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
