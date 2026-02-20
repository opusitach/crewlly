DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ProcedureRuleType'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    INNER JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ProcedureRuleType'
      AND e.enumlabel = 'CASH'
  ) THEN
    ALTER TYPE "ProcedureRuleType"
      ADD VALUE 'CASH';
  END IF;
END $$;
