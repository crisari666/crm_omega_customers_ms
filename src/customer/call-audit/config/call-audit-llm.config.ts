export type CallAuditLlmIndicatorConfig = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
};

export type CallAuditLlmInterestScoreConfig = {
  readonly min: number;
  readonly max: number;
  readonly labels: Readonly<Record<number, string>>;
};

export type CallAuditLlmOutputSchemaDescription = {
  readonly speakerTurns: string;
  readonly indicators: string;
  readonly interestScore: string;
  readonly interestScoreRationale: string;
};

export type CallAuditLlmConfig = {
  readonly version: string;
  readonly model: string;
  readonly temperature: number;
  /** Max completion tokens (raise for long calls; truncation breaks JSON parse). */
  readonly maxTokens: number;
  readonly indicators: readonly CallAuditLlmIndicatorConfig[];
  readonly interestScore: CallAuditLlmInterestScoreConfig;
  readonly prompts: {
    readonly system: string;
    readonly userTemplate: string;
  };
  readonly outputSchema: CallAuditLlmOutputSchemaDescription;
};

export const CALL_AUDIT_LLM_CONFIG: CallAuditLlmConfig = {
  version: '2026-05-v2',
  model: 'deepseek-chat',
  temperature: 0.2,
  maxTokens: 8192,
  indicators: [
    {
      key: 'apertura',
      label: 'Apertura',
      description:
        '¿Mencionó el nombre del referido para generar confianza?',
    },
    {
      key: 'storytelling',
      label: 'Storytelling',
      description:
        '¿Habló de la valorización en Carmen de Apicalá/Cartagena?',
    },
    {
      key: 'escucha_activa',
      label: 'Escucha activa',
      description:
        '¿Dejó hablar al cliente para entender sus miedos?',
    },
    {
      key: 'cierre',
      label: 'Cierre',
      description:
        '¿Agendó la cita o reunión virtual antes de colgar?',
    },
  ],
  interestScore: {
    min: 1,
    max: 5,
    labels: {
      1: 'Muy bajo',
      2: 'Bajo',
      3: 'Medio',
      4: 'Alto',
      5: 'Muy alto',
    },
  },
  prompts: {
    system: `Eres un auditor comercial experto para Holmen / La Ceiba (inmobiliaria).
Analizas transcripciones de llamadas telefónicas en español (Colombia).
La transcripción es un solo bloque de texto; las frases suelen separarse por puntos, sin etiquetas de hablante.
Debes inferir exactamente DOS interlocutores: "agent" (asesor comercial) y "customer" (cliente/prospecto).
Prioriza SIEMPRE completar indicators, interestScore e interestScoreRationale antes que speakerTurns.
speakerTurns debe ser un resumen breve del diálogo (NO repetir la transcripción completa).
Responde ÚNICAMENTE con JSON válido según el esquema indicado, sin markdown ni texto adicional.`,
    userTemplate: `Analiza esta llamada.

Metadatos:
{{callMetadata}}

ID asesor (referencia interna): {{agentExternalRef}}

Transcripción (texto plano, sin diarización):
{{transcript}}

Devuelve UN objeto JSON con las claves EN ESTE ORDEN (obligatorio):
1. indicators: array con un objeto por cada clave: {{indicatorKeys}}
   Cada objeto: { "key", "passed": boolean, "rationale": string, "evidence": string (cita breve, máx. 120 caracteres) }
2. interestScore: entero {{interestMin}}-{{interestMax}} (interés del cliente en la oferta)
3. interestScoreRationale: string breve (máx. 200 caracteres)
4. speakerTurns: array ordenado de { "role": "agent"|"customer", "text": "..." }
   Máximo 20 segmentos; cada text máx. 180 caracteres (resumen, no transcripción literal); fusiona turnos consecutivos del mismo hablante.`,
  },
  outputSchema: {
    speakerTurns:
      'Array<{ role: "agent"|"customer", text: string }> ordenado cronológicamente',
    indicators:
      'Array<{ key: string, passed: boolean, rationale: string, evidence: string }> con todas las claves requeridas',
    interestScore: 'number entero entre min y max',
    interestScoreRationale: 'string',
  },
};
