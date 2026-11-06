const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object, example: unknown) => ({ "application/json": { schema, example } });
const response = (description: string, schema: object, example: unknown) => ({ description, content: json(schema, example) });
const error = (code: number, description: string) => [String(code), response(description, ref("ErrorResponse"), { error: description })];
const errors = (...items: Array<[number, string]>) => Object.fromEntries(items.map(([code, label]) => error(code, label)));
const body = (schema: string, example: object) => ({ required: true, content: json(ref(schema), example) });
const id = { name: "id", in: "path", required: true, description: "Identifiant de la conversation.", schema: { type: "integer", minimum: 1 }, example: 1 };
const page = [
  { name: "limit", in: "query", description: "Taille de page (1 à 50).", schema: { type: "integer", minimum: 1, maximum: 50, default: 30 }, example: 30 },
  { name: "offset", in: "query", description: "Décalage de page (0 à 100000).", schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 }, example: 0 }
];
const auth = errors([401, "Authentification requise."], [403, "Accès interdit."]);
const exampleConversation = { conversationId: 1, daycareId: 1, childId: 1, parentId: 2, childFirstName: "Lina", childLastName: "Durand", parentFirstName: "Camille", parentLastName: "Durand", createdAt: "2026-11-04T09:00:00.000Z", lastActivityAt: "2026-11-04T09:05:00.000Z", unreadCount: 1 };
const exampleMessage = { messageId: 1, conversationId: 1, senderId: 2, senderFirstName: "Camille", senderLastName: "Durand", body: "Bonjour, Lina arrivera à 9 h.", createdAt: "2026-11-04T09:05:00.000Z", firstReadAt: null, myReadAt: null };
const exampleNotification = { messageId: 1, conversationId: 1, childId: 1, childName: "Lina Durand", createdAt: "2026-11-04T09:05:00.000Z", readAt: null };

export const messagingPaths: Record<string, unknown> = {
  "/api/conversations": {
    get: { tags: ["Messaging"], summary: "Lister les conversations autorisées et rechercher par nom d'enfant ou de parent.", operationId: "listConversations",
      parameters: [...page, { name: "search", in: "query", description: "Nom de l'enfant ou du parent, 100 caractères maximum.", schema: { type: "string", maxLength: 100 }, example: "Lina" }],
      responses: { 200: response("Page de conversations et compteurs calculés sur tout le périmètre autorisé.", ref("ConversationPage"), { items: [exampleConversation], total: 1, unreadConversations: 1, unreadMessages: 1, limit: 30, offset: 0 }), ...errors([400, "Paramètre invalide."], ...Object.entries(auth).map(([code, value]) => [Number(code), (value as { description: string }).description] as [number, string])) } },
    post: { tags: ["Messaging"], summary: "Créer ou retrouver une conversation enfant-parent.", operationId: "createConversation",
      description: "Un parent fournit seulement childId ; direction/EJE fournissent childId et parentId. Les groupes multifamilles sont exclus.",
      requestBody: body("CreateConversationRequest", { childId: 1, parentId: 2 }),
      responses: { 201: response("Conversation créée.", ref("Conversation"), exampleConversation), 200: response("Conversation existante.", ref("Conversation"), exampleConversation), ...errors([400, "Données invalides."], [401, "Authentification requise."], [403, "Parent ou enfant inaccessible."], [409, "Conflit."]) } }
  },
  "/api/conversations/{id}": { get: { tags: ["Messaging"], summary: "Lire une conversation autorisée.", operationId: "getConversation", parameters: [id],
    responses: { 200: response("Conversation.", ref("Conversation"), exampleConversation), ...errors([400, "Identifiant invalide."], [401, "Authentification requise."], [403, "Accès interdit."], [404, "Conversation introuvable."]) } } },
  "/api/conversations/{id}/messages": {
    get: { tags: ["Messaging"], summary: "Lire les messages d'une conversation, du plus ancien au plus récent dans la page.", operationId: "listConversationMessages",
      parameters: [id, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 }, example: 50 }, { name: "beforeId", in: "query", description: "Messages dont l'identifiant est inférieur à cette valeur.", schema: { type: "integer", minimum: 1 }, example: 50 }],
      responses: { 200: response("Messages et indicateur de page précédente.", ref("MessagePage"), { items: [exampleMessage], hasMore: false }), ...errors([400, "Paramètre invalide."], [401, "Authentification requise."], [403, "Accès interdit."], [404, "Conversation introuvable."]) } },
    post: { tags: ["Messaging"], summary: "Envoyer un message (2000 caractères maximum).", operationId: "sendMessage", parameters: [id],
      requestBody: body("SendMessageRequest", { body: "Bonjour, Lina arrivera à 9 h." }),
      responses: { 201: response("Message enregistré, destinataires et notification persistante créés.", ref("Message"), exampleMessage), ...errors([400, "Message invalide."], [401, "Authentification requise."], [403, "Accès interdit."], [404, "Conversation introuvable."], [409, "Aucun destinataire disponible."]) } }
  },
  "/api/conversations/{id}/read": { post: { tags: ["Messaging"], summary: "Marquer comme lus ses messages reçus jusqu'à un identifiant.", operationId: "readConversationMessages", parameters: [id],
    description: "Idempotent : la première date de lecture ne change jamais. Un événement Socket.IO conversation:changed est émis sans contenu de message.",
    requestBody: body("ReadConversationRequest", { upToMessageId: 1 }),
    responses: { 204: { description: "Lecture enregistrée ou déjà enregistrée." }, ...errors([400, "Données invalides."], [401, "Authentification requise."], [403, "Accès interdit."], [404, "Conversation ou message introuvable."]) } } },
  "/api/message-notifications": { get: { tags: ["Messaging"], summary: "Lister les notifications persistantes de messages reçus, sans extrait du contenu.", operationId: "listMessageNotifications", parameters: page,
    responses: { 200: response("Notifications visibles et total non-lu indépendant de la page.", ref("MessageNotificationPage"), { items: [exampleNotification], total: 1, unread: 1, limit: 30, offset: 0 }), ...errors([400, "Paramètre invalide."], [401, "Authentification requise."], [403, "Accès interdit."]) } } }
};

const positive = { type: "integer", minimum: 1 };
const date = { type: "string", format: "date-time" };
export const messagingSchemas = {
  Conversation: { type: "object", required: ["conversationId", "daycareId", "childId", "parentId", "childFirstName", "childLastName", "parentFirstName", "parentLastName", "unreadCount"], properties: { conversationId: positive, daycareId: positive, childId: positive, parentId: positive, childFirstName: { type: "string" }, childLastName: { type: "string" }, parentFirstName: { type: "string" }, parentLastName: { type: "string" }, createdAt: date, lastActivityAt: date, unreadCount: { type: "integer", minimum: 0 } } },
  ConversationPage: { type: "object", properties: { items: { type: "array", items: ref("Conversation") }, total: { type: "integer" }, unreadConversations: { type: "integer" }, unreadMessages: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } },
  CreateConversationRequest: { type: "object", required: ["childId"], additionalProperties: false, properties: { childId: positive, parentId: positive } },
  Message: { type: "object", properties: { messageId: positive, conversationId: positive, senderId: positive, senderFirstName: { type: "string" }, senderLastName: { type: "string" }, body: { type: "string", maxLength: 2000 }, createdAt: date, firstReadAt: { ...date, nullable: true }, myReadAt: { ...date, nullable: true } } },
  MessagePage: { type: "object", properties: { items: { type: "array", items: ref("Message") }, hasMore: { type: "boolean" } } },
  SendMessageRequest: { type: "object", required: ["body"], additionalProperties: false, properties: { body: { type: "string", minLength: 1, maxLength: 2000 } } },
  ReadConversationRequest: { type: "object", required: ["upToMessageId"], additionalProperties: false, properties: { upToMessageId: positive } },
  MessageNotification: { type: "object", properties: { messageId: positive, conversationId: positive, childId: positive, childName: { type: "string" }, createdAt: date, readAt: { ...date, nullable: true } } },
  MessageNotificationPage: { type: "object", properties: { items: { type: "array", items: ref("MessageNotification") }, total: { type: "integer" }, unread: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } }
};
