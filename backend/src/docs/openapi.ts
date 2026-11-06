import { p0F1Paths, p0F1Schemas } from "./p0-f1.js";
import { messagingPaths, messagingSchemas } from "./messaging.js";

type OpenApiSchema = Record<string, unknown>;

type OpenApiResponse = {
  description: string;
  content?: Record<string, unknown>;
};

type OperationConfig = {
  tag: string;
  resourceName: string;
  resourceSchema: string;
  createSchema: string;
  updateSchema: string;
  idName: string;
  idDescription: string;
  listSummary: string;
  getSummary: string;
  createSummary: string;
  updateSummary: string;
  deleteSummary: string;
  notFoundMessage: string;
  createExample: Record<string, unknown>;
  updateExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
};

const jsonContent = (schema: OpenApiSchema, example: unknown): Record<string, unknown> => ({
  "application/json": {
    schema,
    example
  }
});

const schemaRef = (name: string): OpenApiSchema => ({
  $ref: `#/components/schemas/${name}`
});

const arrayOf = (name: string): OpenApiSchema => ({
  type: "array",
  items: schemaRef(name)
});

const errorResponse = (description: string, example: Record<string, unknown>): OpenApiResponse => ({
  description,
  content: jsonContent(schemaRef("ErrorResponse"), example)
});

const badRequest = errorResponse("Requête invalide.", {
  error: "Le champ name est obligatoire et invalide."
});

const conflict = errorResponse("Conflit avec une contrainte de base de données.", {
  error: "Cette opération viole une relation existante.",
  code: "ER_NO_REFERENCED_ROW_2"
});

const internalError = errorResponse("Erreur interne du serveur.", {
  error: "Erreur interne du serveur"
});
const unauthorized = errorResponse("Authentification requise.", { error: "Authentification requise." });
const forbidden = errorResponse("Accès interdit par le rôle ou la crèche.", { error: "Accès interdit." });

const idParameter = (name: string, description: string): OpenApiSchema => ({
  name,
  in: "path",
  required: true,
  description,
  schema: {
    type: "integer",
    minimum: 1
  },
  example: 1
});

function crudPaths(config: OperationConfig): Record<string, unknown> {
  const resourcePath = `/api/${config.resourceName}`;
  const itemPath = `${resourcePath}/{${config.idName}}`;
  const notFound = errorResponse("Ressource introuvable.", {
    error: config.notFoundMessage
  });

  return {
    [resourcePath]: {
      get: {
        tags: [config.tag],
        summary: config.listSummary,
        operationId: `list${config.tag.replace(/\s/g, "")}`,
        responses: {
          "200": {
            description: "Liste récupérée avec succès.",
            content: jsonContent(arrayOf(config.resourceSchema), [config.responseExample])
          },
          "401": unauthorized,
          "403": forbidden,
          "500": internalError
        }
      },
      post: {
        tags: [config.tag],
        summary: config.createSummary,
        operationId: `create${config.tag.replace(/\s/g, "")}`,
        requestBody: {
          required: true,
          content: jsonContent(schemaRef(config.createSchema), config.createExample)
        },
        responses: {
          ...(config.resourceName === "daycares" ? {} : {
            "201": {
              description: "Ressource créée avec succès.",
              content: jsonContent(schemaRef(config.resourceSchema), config.responseExample)
            },
            "400": badRequest,
            "409": conflict
          }),
          "401": unauthorized,
          "403": forbidden,
          "500": internalError
        }
      }
    },
    [itemPath]: {
      get: {
        tags: [config.tag],
        summary: config.getSummary,
        operationId: `get${config.tag.replace(/\s/g, "")}ById`,
        parameters: [idParameter(config.idName, config.idDescription)],
        responses: {
          "200": {
            description: "Ressource récupérée avec succès.",
            content: jsonContent(schemaRef(config.resourceSchema), config.responseExample)
          },
          "400": errorResponse("Identifiant invalide.", {
            error: "L'identifiant doit être un entier positif."
          }),
          "404": notFound,
          "401": unauthorized,
          "403": forbidden,
          "500": internalError
        }
      },
      patch: {
        tags: [config.tag],
        summary: config.updateSummary,
        operationId: `update${config.tag.replace(/\s/g, "")}`,
        parameters: [idParameter(config.idName, config.idDescription)],
        requestBody: {
          required: true,
          content: jsonContent(schemaRef(config.updateSchema), config.updateExample)
        },
        responses: {
          "200": {
            description: "Ressource mise à jour avec succès.",
            content: jsonContent(schemaRef(config.resourceSchema), config.responseExample)
          },
          "400": errorResponse("Requête invalide.", {
            error: "Au moins une valeur doit être fournie."
          }),
          "404": notFound,
          "409": conflict,
          "401": unauthorized,
          "403": forbidden,
          "500": internalError
        }
      },
      delete: {
        tags: [config.tag],
        summary: config.deleteSummary,
        operationId: `delete${config.tag.replace(/\s/g, "")}`,
        parameters: [idParameter(config.idName, config.idDescription)],
        responses: {
          ...(config.resourceName === "daycares" ? {} : {
            "204": { description: "Ressource supprimée avec succès." }
          }),
          "400": errorResponse("Identifiant invalide.", {
            error: "L'identifiant doit être un entier positif."
          }),
          ...(config.resourceName === "daycares" ? {} : { "404": notFound }),
          "409": config.resourceName === "daycares"
            ? errorResponse("La crèche du compte courant ne peut pas être supprimée.", {
              error: "La crèche du compte courant ne peut pas être supprimée."
            }) : conflict,
          "401": unauthorized,
          "403": forbidden,
          "500": internalError
        }
      }
    }
  };
}

const timeSchema: OpenApiSchema = {
  type: "string",
  pattern: "^([01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$",
  example: "14:30"
};

const nullableComment: OpenApiSchema = {
  type: "string",
  nullable: true,
  maxLength: 65535,
  example: "Tout s'est bien passé."
};

const positiveInteger: OpenApiSchema = {
  type: "integer",
  minimum: 1
};

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Carelia Backend API",
    version: "0.1.0",
    description:
      "Documentation OpenAPI des endpoints REST Carelia. Selon SERVICE_NAME, un conteneur peut exposer seulement une partie des endpoints métier."
  },
  // URL relative : chaque microservice sert sa propre doc, donc "Try it out" doit viser
  // le service qui affiche la page (une URL absolue vers un autre port serait bloquée par CORS).
  servers: [
    {
      url: "/",
      description: "Service courant"
    }
  ],
  security: [{ cookieAuth: [] }],
  tags: [
    { name: "Root", description: "Informations générales de l'API." },
    { name: "Health", description: "État de santé du service et de MySQL." },
    { name: "Auth", description: "Connexion, session et identité courante." },
    { name: "Children", description: "Fiches enfants et liens parent-enfant." },
    { name: "Reports", description: "Bulletins quotidiens et publication." },
    { name: "References", description: "Valeurs de référence pour les formulaires." },
    { name: "Notifications", description: "Envoi des bulletins publiés aux parents." },
    { name: "Messaging", description: "Conversations officielles enfant-parent avec la crèche." },
    { name: "Users", description: "Gestion des utilisateurs." },
    { name: "Daycares", description: "Gestion des crèches." },
    { name: "Diaper Changes", description: "Gestion des changes du bulletin quotidien." },
    { name: "Moods", description: "Gestion des observations d'humeur." },
    { name: "Naps", description: "Gestion des siestes." }
  ],
  paths: {
    "/api": {
      get: {
        tags: ["Root"],
        security: [],
        summary: "Récupérer les informations de base de l'API.",
        operationId: "getApiInfo",
        responses: {
          "200": {
            description: "Informations de l'API.",
            content: jsonContent(schemaRef("ApiInfo"), {
              name: "carelia-api",
              version: "0.1.0"
            })
          }
        }
      }
    },
    "/api/health": {
      get: {
        tags: ["Health"],
        security: [],
        summary: "Vérifier l'état de l'API et la connexion à MySQL.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Service disponible et base de données connectée.",
            content: jsonContent(schemaRef("HealthResponse"), {
              status: "ok",
              service: "carelia-api",
              database: "connected",
              timestamp: "2026-10-06T10:15:30.000Z"
            })
          },
          "503": {
            description: "Service lancé mais base de données indisponible.",
            content: jsonContent(schemaRef("HealthResponse"), {
              status: "error",
              service: "carelia-api",
              database: "unavailable",
              timestamp: "2026-10-06T10:15:30.000Z"
            })
          }
        }
      }
    },
    "/api/docs/": {
      get: {
        tags: ["Root"], security: [], summary: "Ouvrir l'interface Swagger du service courant.",
        operationId: "getSwaggerUi",
        responses: { "200": { description: "Page HTML de Swagger UI.", content: { "text/html": { schema: { type: "string" } } } } }
      }
    },
    "/api/docs/openapi.json": {
      get: {
        tags: ["Root"], security: [], summary: "Lire la spécification OpenAPI filtrée du service courant.",
        operationId: "getOpenApiDocument",
        responses: { "200": { description: "Document OpenAPI JSON.", content: { "application/json": { schema: { type: "object" } } } } }
      }
    },
    ...p0F1Paths,
    ...messagingPaths,
    ...crudPaths({
      tag: "Users",
      resourceName: "users",
      resourceSchema: "User",
      createSchema: "CreateUserRequest",
      updateSchema: "UpdateUserRequest",
      idName: "id",
      idDescription: "Identifiant de l'utilisateur.",
      listSummary: "Lister les utilisateurs.",
      getSummary: "Récupérer un utilisateur par identifiant.",
      createSummary: "Créer un utilisateur.",
      updateSummary: "Mettre à jour un utilisateur.",
      deleteSummary: "Supprimer un utilisateur.",
      notFoundMessage: "Utilisateur introuvable.",
      createExample: {
        daycareId: 1,
        roleId: 2,
        email: "parent@example.com",
        password: "MotDePasse123",
        lastName: "Martin",
        firstName: "Camille",
        phone: "+33612345678",
        address: "12 rue des Lilas",
        isActive: true
      },
      updateExample: {
        password: "NouveauMotDePasse123",
        phone: "+33687654321",
        isActive: true
      },
      responseExample: {
        userId: 1,
        daycareId: 1,
        roleId: 2,
        email: "parent@example.com",
        lastName: "Martin",
        firstName: "Camille",
        phone: "+33612345678",
        address: "12 rue des Lilas",
        isActive: true
      }
    }),
    ...crudPaths({
      tag: "Daycares",
      resourceName: "daycares",
      resourceSchema: "Daycare",
      createSchema: "DaycareRequest",
      updateSchema: "DaycareRequest",
      idName: "id",
      idDescription: "Identifiant de la crèche.",
      listSummary: "Lister les crèches.",
      getSummary: "Récupérer une crèche par identifiant.",
      createSummary: "Création de crèche indisponible sans administrateur plateforme (403).",
      updateSummary: "Renommer une crèche.",
      deleteSummary: "Suppression de la crèche courante indisponible (409).",
      notFoundMessage: "Crèche introuvable.",
      createExample: {
        name: "Les Petits Explorateurs"
      },
      updateExample: {
        name: "Crèche Carelia République"
      },
      responseExample: {
        daycareId: 1,
        name: "Les Petits Explorateurs"
      }
    }),
    ...crudPaths({
      tag: "Diaper Changes",
      resourceName: "diaper-changes",
      resourceSchema: "DiaperChange",
      createSchema: "CreateDiaperChangeRequest",
      updateSchema: "UpdateDiaperChangeRequest",
      idName: "id",
      idDescription: "Identifiant du change.",
      listSummary: "Lister les changes.",
      getSummary: "Récupérer un change par identifiant.",
      createSummary: "Créer un change.",
      updateSummary: "Mettre à jour un change.",
      deleteSummary: "Supprimer un change.",
      notFoundMessage: "Change introuvable.",
      createExample: {
        dailyReportId: 1,
        diaperChangeTypeId: 2,
        changeTime: "10:45",
        comment: "Change complet."
      },
      updateExample: {
        changeTime: "11:00",
        comment: "RAS."
      },
      responseExample: {
        diaperChangeId: 1,
        dailyReportId: 1,
        diaperChangeTypeId: 2,
        changeTime: "10:45:00",
        comment: "Change complet."
      }
    }),
    ...crudPaths({
      tag: "Moods",
      resourceName: "moods",
      resourceSchema: "MoodObservation",
      createSchema: "CreateMoodObservationRequest",
      updateSchema: "UpdateMoodObservationRequest",
      idName: "id",
      idDescription: "Identifiant de l'observation d'humeur.",
      listSummary: "Lister les observations d'humeur.",
      getSummary: "Récupérer une observation d'humeur par identifiant.",
      createSummary: "Créer une observation d'humeur.",
      updateSummary: "Mettre à jour une observation d'humeur.",
      deleteSummary: "Supprimer une observation d'humeur.",
      notFoundMessage: "Observation d'humeur introuvable.",
      createExample: {
        dailyReportId: 1,
        moodId: 3,
        observedTime: "09:30",
        comment: "Très souriant ce matin."
      },
      updateExample: {
        observedTime: "09:45",
        comment: "Calme après l'activité."
      },
      responseExample: {
        moodObservationId: 1,
        dailyReportId: 1,
        moodId: 3,
        observedTime: "09:30:00",
        comment: "Très souriant ce matin."
      }
    }),
    ...crudPaths({
      tag: "Naps",
      resourceName: "naps",
      resourceSchema: "Nap",
      createSchema: "CreateNapRequest",
      updateSchema: "UpdateNapRequest",
      idName: "id",
      idDescription: "Identifiant de la sieste.",
      listSummary: "Lister les siestes.",
      getSummary: "Récupérer une sieste par identifiant.",
      createSummary: "Créer une sieste.",
      updateSummary: "Mettre à jour une sieste.",
      deleteSummary: "Supprimer une sieste.",
      notFoundMessage: "Sieste introuvable.",
      createExample: {
        dailyReportId: 1,
        napQualityId: 2,
        startTime: "13:15",
        endTime: "14:30",
        comment: "Endormissement rapide."
      },
      updateExample: {
        endTime: "14:45",
        comment: "Réveil calme."
      },
      responseExample: {
        napId: 1,
        dailyReportId: 1,
        napQualityId: 2,
        startTime: "13:15:00",
        endTime: "14:30:00",
        comment: "Endormissement rapide."
      }
    })
  },
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "carelia_session", description: "Cookie HttpOnly posé par POST /api/auth/login sur le service Users." }
    },
    schemas: {
      ...p0F1Schemas,
      ...messagingSchemas,
      ApiInfo: {
        type: "object",
        required: ["name", "version"],
        properties: {
          name: { type: "string", example: "carelia-api" },
          version: { type: "string", example: "0.1.0" }
        }
      },
      HealthResponse: {
        type: "object",
        required: ["status", "service", "database", "timestamp"],
        properties: {
          status: { type: "string", enum: ["ok", "error"] },
          service: { type: "string", example: "carelia-api" },
          database: { type: "string", enum: ["connected", "unavailable"] },
          timestamp: { type: "string", format: "date-time" }
        }
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", example: "Route introuvable" },
          code: { type: "string", example: "ER_DUP_ENTRY" },
          details: { type: "string", example: "Détail technique en développement uniquement." },
          path: { type: "string", example: "/api/unknown" }
        }
      },
      Daycare: {
        type: "object",
        required: ["daycareId", "name"],
        properties: {
          daycareId: positiveInteger,
          name: { type: "string", maxLength: 150, example: "Les Petits Explorateurs" }
        }
      },
      DaycareRequest: {
        type: "object",
        required: ["name"],
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 150, example: "Les Petits Explorateurs" }
        }
      },
      User: {
        type: "object",
        required: [
          "userId", "daycareId", "roleId", "email", "lastName", "firstName",
          "phone", "address", "isActive"
        ],
        properties: {
          userId: positiveInteger,
          daycareId: positiveInteger,
          roleId: positiveInteger,
          email: { type: "string", format: "email", maxLength: 320 },
          lastName: { type: "string", maxLength: 100, example: "Martin" },
          firstName: { type: "string", maxLength: 100, example: "Camille" },
          phone: { type: "string", nullable: true, maxLength: 30, example: "+33612345678" },
          address: { type: "string", nullable: true, maxLength: 65535, example: "12 rue des Lilas" },
          isActive: { type: "boolean", example: true }
        }
      },
      CreateUserRequest: {
        type: "object",
        required: ["daycareId", "roleId", "email", "password", "lastName", "firstName"],
        additionalProperties: false,
        properties: {
          daycareId: positiveInteger,
          roleId: positiveInteger,
          email: { type: "string", format: "email", maxLength: 320 },
          password: {
            type: "string",
            minLength: 8,
            maxLength: 72,
            description: "Mot de passe en clair envoyé par le client. Il est hashé par le backend avant l'écriture en base."
          },
          lastName: { type: "string", maxLength: 100 },
          firstName: { type: "string", maxLength: 100 },
          phone: { type: "string", nullable: true, maxLength: 30 },
          address: { type: "string", nullable: true, maxLength: 65535 },
          isActive: { type: "boolean", default: true }
        }
      },
      UpdateUserRequest: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          daycareId: positiveInteger,
          roleId: positiveInteger,
          email: { type: "string", format: "email", maxLength: 320 },
          password: {
            type: "string",
            minLength: 8,
            maxLength: 72,
            description: "Nouveau mot de passe en clair. Le backend le hash avant l'écriture en base."
          },
          lastName: { type: "string", maxLength: 100 },
          firstName: { type: "string", maxLength: 100 },
          phone: { type: "string", nullable: true, maxLength: 30 },
          address: { type: "string", nullable: true, maxLength: 65535 },
          isActive: { type: "boolean" }
        }
      },
      DiaperChange: {
        type: "object",
        required: ["diaperChangeId", "dailyReportId", "diaperChangeTypeId", "changeTime", "comment"],
        properties: {
          diaperChangeId: positiveInteger,
          dailyReportId: positiveInteger,
          diaperChangeTypeId: positiveInteger,
          changeTime: timeSchema,
          comment: nullableComment
        }
      },
      CreateDiaperChangeRequest: {
        type: "object",
        required: ["dailyReportId", "diaperChangeTypeId", "changeTime"],
        additionalProperties: false,
        properties: {
          dailyReportId: positiveInteger,
          diaperChangeTypeId: positiveInteger,
          changeTime: timeSchema,
          comment: nullableComment
        }
      },
      UpdateDiaperChangeRequest: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          dailyReportId: positiveInteger,
          diaperChangeTypeId: positiveInteger,
          changeTime: timeSchema,
          comment: nullableComment
        }
      },
      MoodObservation: {
        type: "object",
        required: ["moodObservationId", "dailyReportId", "moodId", "observedTime", "comment"],
        properties: {
          moodObservationId: positiveInteger,
          dailyReportId: positiveInteger,
          moodId: positiveInteger,
          observedTime: timeSchema,
          comment: nullableComment
        }
      },
      CreateMoodObservationRequest: {
        type: "object",
        required: ["dailyReportId", "moodId", "observedTime"],
        additionalProperties: false,
        properties: {
          dailyReportId: positiveInteger,
          moodId: positiveInteger,
          observedTime: timeSchema,
          comment: nullableComment
        }
      },
      UpdateMoodObservationRequest: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          dailyReportId: positiveInteger,
          moodId: positiveInteger,
          observedTime: timeSchema,
          comment: nullableComment
        }
      },
      Nap: {
        type: "object",
        required: ["napId", "dailyReportId", "napQualityId", "startTime", "endTime", "comment"],
        properties: {
          napId: positiveInteger,
          dailyReportId: positiveInteger,
          napQualityId: positiveInteger,
          startTime: timeSchema,
          endTime: timeSchema,
          comment: nullableComment
        }
      },
      CreateNapRequest: {
        type: "object",
        required: ["dailyReportId", "napQualityId", "startTime", "endTime"],
        additionalProperties: false,
        properties: {
          dailyReportId: positiveInteger,
          napQualityId: positiveInteger,
          startTime: timeSchema,
          endTime: timeSchema,
          comment: nullableComment
        }
      },
      UpdateNapRequest: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          dailyReportId: positiveInteger,
          napQualityId: positiveInteger,
          startTime: timeSchema,
          endTime: timeSchema,
          comment: nullableComment
        }
      }
    }
  }
} as const;
