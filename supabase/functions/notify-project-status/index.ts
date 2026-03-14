import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Gepland",
  in_progress: "In uitvoering",
  on_hold: "On hold",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_id, old_status, new_status } = await req.json();

    if (!project_id || !old_status || !new_status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Look up project + customer
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, title, customer_id, customers(name, contact_email)")
      .eq("id", project_id)
      .single();

    if (projErr || !project) {
      console.error("Project not found:", projErr);
      return new Response(
        JSON.stringify({ error: "Project not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = (project as any).customers;
    const recipientEmail = customer?.contact_email || null;

    // Log notification
    const { error: insertErr } = await supabase
      .from("project_notifications")
      .insert({
        project_id,
        customer_id: project.customer_id,
        recipient_email: recipientEmail,
        old_status,
        new_status,
        project_title: project.title,
        email_sent: false,
      });

    if (insertErr) {
      console.error("Failed to log notification:", insertErr);
    }

    // Attempt to send email via enqueue_email RPC (if email infra is set up)
    let emailSent = false;
    if (recipientEmail) {
      try {
        const oldLabel = STATUS_LABELS[old_status] || old_status;
        const newLabel = STATUS_LABELS[new_status] || new_status;

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a1a1a; margin-bottom: 8px;">Projectstatus bijgewerkt</h2>
            <p style="color: #555; font-size: 14px; margin-bottom: 20px;">
              De status van project <strong>${project.title}</strong> is gewijzigd.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 8px 12px; background: #f5f5f5; border-radius: 4px 0 0 0; color: #888; font-size: 12px;">Vorige status</td>
                <td style="padding: 8px 12px; background: #f5f5f5; border-radius: 0 4px 0 0; font-size: 14px;">${oldLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #e8f5e9; border-radius: 0 0 0 4px; color: #888; font-size: 12px;">Nieuwe status</td>
                <td style="padding: 8px 12px; background: #e8f5e9; border-radius: 0 0 4px 0; font-size: 14px; font-weight: bold;">${newLabel}</td>
              </tr>
            </table>
            <p style="color: #555; font-size: 13px;">
              Klant: ${customer?.name || "Onbekend"}<br/>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #aaa; font-size: 11px;">VoltControl IO — Projectbeheer</p>
          </div>
        `;

        // Try enqueue_email (managed email infra)
        const { error: emailErr } = await supabase.rpc("enqueue_email", {
          p_queue_name: "transactional_emails",
          p_message_id: `project-status-${project_id}-${Date.now()}`,
          p_to: recipientEmail,
          p_subject: `Project "${project.title}" — status gewijzigd naar ${newLabel}`,
          p_html: htmlBody,
          p_template_name: "project_status_change",
        });

        if (!emailErr) {
          emailSent = true;
          // Update notification record
          await supabase
            .from("project_notifications")
            .update({ email_sent: true })
            .eq("project_id", project_id)
            .eq("new_status", new_status)
            .order("created_at", { ascending: false })
            .limit(1);
        } else {
          console.log("Email queue not available (domain not configured yet):", emailErr.message);
        }
      } catch (emailError) {
        console.log("Email sending skipped (infra not ready):", emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notification_logged: true,
        email_sent: emailSent,
        recipient: recipientEmail,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
