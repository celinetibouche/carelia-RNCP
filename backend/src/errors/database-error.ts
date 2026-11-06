import { AppError } from "./app-error.js";

type MysqlError = {
  code?: unknown;
};

export function toDatabaseError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const candidateCode = (error as MysqlError).code;
  const code = typeof candidateCode === "string" ? candidateCode : undefined;

  switch (code) {
    case "ER_DUP_ENTRY":
      return new AppError("Une donnée avec cette valeur existe déjà.", 409, code);
    case "ER_NO_REFERENCED_ROW_2":
    case "ER_ROW_IS_REFERENCED_2":
      return new AppError("Cette opération viole une relation existante.", 409, code);
    case "ER_BAD_NULL_ERROR":
    case "ER_DATA_TOO_LONG":
    case "ER_TRUNCATED_WRONG_VALUE":
    case "ER_CHECK_CONSTRAINT_VIOLATED":
      return new AppError("Les données fournies sont invalides.", 400, code);
    default:
      return new AppError(
        "Une erreur est survenue lors de l'accès à la base de données.",
        500,
        code
      );
  }
}
