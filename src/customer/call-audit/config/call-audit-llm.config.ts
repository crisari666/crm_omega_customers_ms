export type CallAuditLlmIndicatorConfig = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly maxPoints: number;
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
  version: '2026-09-v3',
  model: 'deepseek-chat',
  temperature: 0.2,
  maxTokens: 8192,
  indicators: [
    {
      key: 'saludo',
      label: 'Saludo',
      description:
        '¿Saludó de forma profesional, se presentó y generó confianza al inicio?',
      maxPoints: 10,
    },
    {
      key: 'descubrimiento',
      label: 'Descubrimiento',
      description:
        '¿Hizo preguntas para entender necesidades, motivaciones y contexto del cliente?',
      maxPoints: 20,
    },
    {
      key: 'argumentacion',
      label: 'Argumentación',
      description:
        '¿Presentó beneficios del proyecto / valorización de forma clara y persuasiva?',
      maxPoints: 15,
    },
    {
      key: 'manejo_objeciones',
      label: 'Manejo de Objeciones',
      description:
        '¿Identificó y respondió objeciones del cliente de forma adecuada?',
      maxPoints: 15,
    },
    {
      key: 'cierre',
      label: 'Cierre',
      description:
        '¿Propuso un siguiente paso concreto (cita, reunión, seguimiento)?',
      maxPoints: 15,
    },
    {
      key: 'rapport',
      label: 'Rapport',
      description:
        '¿Mantuvo un tono empático y construyó conexión con el cliente?',
      maxPoints: 10,
    },
    {
      key: 'escucha_activa',
      label: 'Escucha Activa',
      description:
        '¿Dejó hablar al cliente, escuchó y respondió en función de lo dicho?',
      maxPoints: 10,
    },
    {
      key: 'registro_crm',
      label: 'Registro CRM',
      description:
        '¿Quedó evidencia de compromiso de registrar / actualizar datos en CRM (notas, seguimiento)?',
      maxPoints: 5,
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
Analizas transcripciones de llamadas VOIP o reuniones Google Meet en español (Colombia).
La transcripción puede ser texto plano o turnos con marcas de tiempo y hablante ([mm:ss] Speaker: texto).
Debes inferir exactamente DOS interlocutores: "agent" (asesor/ventor) y "customer" (cliente/prospecto).
Evalúa la rúbrica ponderada (máx. 100 pts). Cada indicador es pass/fail; el servidor calcula los puntos.
Prioriza SIEMPRE completar indicators, interestScore e interestScoreRationale antes que speakerTurns.
speakerTurns debe ser un resumen breve del diálogo (NO repetir la transcripción completa) cuando no haya diarización nativa.
Responde ÚNICAMENTE con JSON válido según el esquema indicado, sin markdown ni texto adicional.`,
    userTemplate: `Analiza esta llamada / reunión.

Metadatos:
{{callMetadata}}

ID asesor (referencia interna): {{agentExternalRef}}

Transcripción:
{{transcript}}

Devuelve UN objeto JSON con las claves EN ESTE ORDEN (obligatorio):
1. indicators: array con un objeto por cada clave: {{indicatorKeys}}
   Cada objeto: { "key", "passed": boolean, "rationale": string, "evidence": string (cita breve, máx. 120 caracteres) }
   Rúbrica (passed otorga los puntos máximos del indicador; failed otorga 0):
   - saludo: 10 pts
   - descubrimiento: 20 pts
   - argumentacion: 15 pts
   - manejo_objeciones: 15 pts
   - cierre: 15 pts
   - rapport: 10 pts
   - escucha_activa: 10 pts
   - registro_crm: 5 pts
2. interestScore: entero {{interestMin}}-{{interestMax}} (interés del cliente en la oferta)
3. interestScoreRationale: string breve (máx. 200 caracteres)
4. speakerTurns: array ordenado de { "role": "agent"|"customer", "text": "..." }
   Máximo 20 segmentos; cada text máx. 180 caracteres (resumen, no transcripción literal); fusiona turnos consecutivos del mismo hablante.
   Si la transcripción ya trae hablantes y tiempos, resume respetando el orden cronológico.`,
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
