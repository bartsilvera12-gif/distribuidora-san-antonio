export type EtapaFunnel =
  | "LEAD"
  | "CONTACTADO"
  | "NEGOCIACION"
  | "GANADO"
  | "PERDIDO";

export interface Nota {
  id:     string;
  texto:  string;
  fecha:  string; // ISO string
}

export interface Prospecto {
  id:                    string;
  numero_control:        string;       // CRM-000001, CRM-000002, …
  empresa:               string;
  contacto:              string;
  email?:                string;
  telefono?:             string;
  servicio:              string;       // producto / servicio de interés
  valor_estimado:        number;       // en GS
  etapa:                 EtapaFunnel;
  proxima_accion?:       string;       // descripción de la próxima acción
  fecha_proxima_accion?: string;       // YYYY-MM-DD
  creado_por?:           string;       // nombre del usuario que creó el prospecto
  origen_creacion?:      "manual" | "whatsapp";  // manual=formulario, whatsapp=mensaje entrante (futuro)
  responsable?:          string;       // nombre del responsable de seguimiento
  notas:                 Nota[];
  fecha_creacion:        string;       // ISO string, automático
  fecha_actualizacion:   string;       // ISO string, actualizado en cada cambio
  cliente_creado?:       boolean;      // true cuando se generó el cliente asociado
}
