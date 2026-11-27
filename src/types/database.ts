/**
 * Types des tables de la base locale (miroir de src/server/db/schema.ts).
 * À mettre à jour à la main après chaque migration ajoutée dans schema.ts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ConsultationStatus = "draft" | "in_progress" | "validated" | "archived";
export type TranscriptionStatus = "pending" | "processing" | "completed" | "failed";
export type ObservationValidationStatus = "draft" | "ai_extracted" | "in_review" | "validated";
export type PrescriptionValidationStatus = "draft" | "validated";
export type DocumentType = "observation" | "prescription";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          professional_info: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          professional_info?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          professional_info?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          audio_retention_days: number;
          transcription_language: string;
          institution_info: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          audio_retention_days?: number;
          transcription_language?: string;
          institution_info?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          audio_retention_days?: number;
          transcription_language?: string;
          institution_info?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      consultations: {
        Row: {
          id: string;
          user_id: string;
          patient_name: string | null;
          patient_first_name: string | null;
          patient_date_of_birth: string | null;
          patient_gender: "M" | "F" | null;
          patient_information: Json;
          vessel_information: Json;
          call_information: Json;
          consultation_date: string;
          status: ConsultationStatus;
          recording_consent_at: string | null;
          ai_processing_acknowledged_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          patient_name?: string | null;
          patient_first_name?: string | null;
          patient_date_of_birth?: string | null;
          patient_gender?: "M" | "F" | null;
          patient_information?: Json;
          vessel_information?: Json;
          call_information?: Json;
          consultation_date?: string;
          status?: ConsultationStatus;
          recording_consent_at?: string | null;
          ai_processing_acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          patient_name?: string | null;
          patient_first_name?: string | null;
          patient_date_of_birth?: string | null;
          patient_gender?: "M" | "F" | null;
          patient_information?: Json;
          vessel_information?: Json;
          call_information?: Json;
          consultation_date?: string;
          status?: ConsultationStatus;
          recording_consent_at?: string | null;
          ai_processing_acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recordings: {
        Row: {
          id: string;
          consultation_id: string;
          user_id: string;
          storage_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          duration: number | null;
          segment_index: number;
          transcription_status: TranscriptionStatus;
          transcription_error: string | null;
          delete_after: string | null;
          deleted_at: string | null;
          source: "microphone" | "upload";
          original_filename: string | null;
          transcript: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          consultation_id: string;
          user_id?: string;
          storage_path: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          duration?: number | null;
          segment_index?: number;
          transcription_status?: TranscriptionStatus;
          transcription_error?: string | null;
          delete_after?: string | null;
          deleted_at?: string | null;
          source?: "microphone" | "upload";
          original_filename?: string | null;
          transcript?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          consultation_id?: string;
          user_id?: string;
          storage_path?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          duration?: number | null;
          segment_index?: number;
          transcription_status?: TranscriptionStatus;
          transcription_error?: string | null;
          delete_after?: string | null;
          deleted_at?: string | null;
          source?: "microphone" | "upload";
          original_filename?: string | null;
          transcript?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transcriptions: {
        Row: {
          id: string;
          consultation_id: string;
          user_id: string;
          original_transcript: string;
          corrected_transcript: string | null;
          language: string;
          provider: string | null;
          model: string | null;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          consultation_id: string;
          user_id?: string;
          original_transcript?: string;
          corrected_transcript?: string | null;
          language?: string;
          provider?: string | null;
          model?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          consultation_id?: string;
          user_id?: string;
          original_transcript?: string;
          corrected_transcript?: string | null;
          language?: string;
          provider?: string | null;
          model?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      observation_forms: {
        Row: {
          id: string;
          consultation_id: string;
          user_id: string;
          form_data: Json;
          ai_extraction: Json | null;
          schema_version: number;
          validation_status: ObservationValidationStatus;
          validated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          consultation_id: string;
          user_id?: string;
          form_data?: Json;
          ai_extraction?: Json | null;
          schema_version?: number;
          validation_status?: ObservationValidationStatus;
          validated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          consultation_id?: string;
          user_id?: string;
          form_data?: Json;
          ai_extraction?: Json | null;
          schema_version?: number;
          validation_status?: ObservationValidationStatus;
          validated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      prescriptions: {
        Row: {
          id: string;
          consultation_id: string;
          user_id: string;
          prescription_data: Json;
          validation_status: PrescriptionValidationStatus;
          validated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          consultation_id: string;
          user_id?: string;
          prescription_data?: Json;
          validation_status?: PrescriptionValidationStatus;
          validated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          consultation_id?: string;
          user_id?: string;
          prescription_data?: Json;
          validation_status?: PrescriptionValidationStatus;
          validated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      generated_documents: {
        Row: {
          id: string;
          consultation_id: string;
          user_id: string;
          document_type: DocumentType;
          storage_path: string;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          consultation_id: string;
          user_id?: string;
          document_type: DocumentType;
          storage_path: string;
          version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          consultation_id?: string;
          user_id?: string;
          document_type?: DocumentType;
          storage_path?: string;
          version?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          user_id: string;
          consultation_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string;
          consultation_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          consultation_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      owns_consultation: { Args: { target: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database["public"]["Tables"];
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"];
