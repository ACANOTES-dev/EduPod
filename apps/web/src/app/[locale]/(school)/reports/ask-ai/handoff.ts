/**
 * Local-storage handoff key consumed by the Custom Report Builder when
 * the Ask-AI page sends a translated `SavedReportQuery` over.
 *
 * Lives in its own module (rather than next to the page component)
 * because Next.js's page-route type rules disallow arbitrary named
 * exports from a `page.tsx` file. The builder imports this key when
 * it boots; the Ask-AI page also imports it when handing off.
 */
export const ASK_AI_HANDOFF_KEY = 'reports-ask-ai-handoff';
