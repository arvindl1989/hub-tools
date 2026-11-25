// ── Marketing Hub — Power Query ──────────────────────────────────────────────
// Paste each block into Power BI Desktop: Home → Transform data → New Source →
// Blank Query → Advanced Editor → replace everything → Done. Name each query
// exactly as the comment says, because the measures and relationships use
// these names.
//
// Do ModelFile first: every other query reads it.
//
// Nothing here derives anything. Which service a ticket counts in, whether an
// SLA was missed, how many productive days somebody had — all of that is
// already a column, computed by the app. These queries only type and load.


// ═══ Query name: ModelFile ═══════════════════════════════════════════════════
// The only thing to edit. Point it at the workbook the flow drops in
// SharePoint. Right-click → uncheck "Enable load" so it does not become a
// table — it is just the source the others read.
let
    // Replace with your own. In SharePoint: open the file → ... → Details →
    // Path, then append the file name.
    FileUrl = "https://<tenant>.sharepoint.com/sites/<site>/Shared%20Documents/<folder>/marketing-hub-model.xlsx",
    Source  = Excel.Workbook(Web.Contents(FileUrl), null, true)
in
    Source


// ═══ Query name: fact_ticket ═════════════════════════════════════════════════
let
    Sheet = ModelFile{[Item = "fact_ticket", Kind = "Sheet"]}[Data],
    Head  = Table.PromoteHeaders(Sheet, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Head, {
        {"ticket", type text}, {"summary", type text},
        {"requested_by", type text}, {"specialist", type text},
        {"frontline", type text}, {"area", type text},
        {"sub_category", type text}, {"state", type text},
        {"created", type datetime}, {"closed", type datetime},
        {"sla_due", type datetime},
        {"service", type text}, {"capacity_column", type text},
        {"capacity_service", type text},
        {"is_closed", type logical}, {"is_open", type logical},
        {"effort_hours", type number}, {"effort_days", type number},
        {"sla_working_days", Int64.Type}, {"sla_breached", type logical},
        {"sla_days_over", Int64.Type}, {"turnaround_days", Int64.Type},
        {"age_days", Int64.Type}, {"year", Int64.Type}, {"month", type text}}),
    // Date-only keys, so the relationships to dim_date join. A datetime with a
    // time on it matches nothing in a date table and silently drops the row
    // from every date-sliced visual.
    Keys  = Table.AddColumn(
                Table.AddColumn(Typed, "created_date", each Date.From([created]), type date),
                "closed_date", each if [closed] = null then null else Date.From([closed]), type date)
in
    Keys


// ═══ Query name: fact_feedback ═══════════════════════════════════════════════
let
    Sheet = ModelFile{[Item = "fact_feedback", Kind = "Sheet"]}[Data],
    Head  = Table.PromoteHeaders(Sheet, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Head, {
        {"ticket", type text}, {"submitted", type datetime},
        {"specialist", type text}, {"service", type text},
        {"area", type text}, {"frontline", type text},
        {"score", type number}, {"overall", type number},
        {"quality", type number}, {"timeliness", type number},
        {"interaction", type number},
        {"comment", type text}, {"has_comment", type logical},
        {"band", type text}, {"year", Int64.Type}, {"month", type text}}),
    Keys  = Table.AddColumn(Typed, "submitted_date",
                            each if [submitted] = null then null else Date.From([submitted]),
                            type date)
in
    Keys


// ═══ Query name: dim_person ══════════════════════════════════════════════════
let
    Sheet = ModelFile{[Item = "dim_person", Kind = "Sheet"]}[Data],
    Head  = Table.PromoteHeaders(Sheet, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Head, {
        {"person", type text}, {"year", Int64.Type},
        {"working_days", type number}, {"holidays", type number},
        {"availability", type number}, {"cadence_days", type number},
        {"training_days", type number}, {"productive_days", type number},
        {"has_left", type logical}}),
    // The grain is person AND year, so the key has to be both. Relating on
    // person alone would make every year's days apply to every year's work.
    Key   = Table.AddColumn(Typed, "person_year",
                            each [person] & "|" & Text.From([year]), type text)
in
    Key


// ═══ Query name: dim_service ═════════════════════════════════════════════════
let
    Sheet = ModelFile{[Item = "dim_service", Kind = "Sheet"]}[Data],
    Head  = Table.PromoteHeaders(Sheet, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Head, {
        {"year", Int64.Type}, {"capacity_column", type text},
        {"service", type text}, {"goal_hours", type number},
        {"year_hours", type number}, {"routed_by", type text},
        {"sub_categories", type text}, {"teams", type text}}),
    Key   = Table.AddColumn(Typed, "service_year",
                            each [capacity_column] & "|" & Text.From([year]), type text)
in
    Key


// ═══ Query name: dim_date ════════════════════════════════════════════════════
// Mark this as the date table: Table tools → Mark as date table → date.
let
    Sheet = ModelFile{[Item = "dim_date", Kind = "Sheet"]}[Data],
    Head  = Table.PromoteHeaders(Sheet, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Head, {
        {"date", type date}, {"year", Int64.Type}, {"month", type text},
        {"month_name", type text}, {"quarter", type text}, {"weekday", type text},
        {"is_weekend", type logical}, {"is_holiday", type logical},
        {"is_working_day", type logical}, {"holiday", type text}})
in
    Typed


// ═══ Query name: dim_setting ═════════════════════════════════════════════════
// Put this on a page as a plain table. When somebody asks why a figure here
// differs from the app, "Built" answers it before anyone opens anything.
let
    Sheet = ModelFile{[Item = "dim_setting", Kind = "Sheet"]}[Data],
    Head  = Table.PromoteHeaders(Sheet, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Head, {{"setting", type text}, {"value", type text}})
in
    Typed
