const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object, example: unknown) => ({ "application/json": { schema, example } });
const response = (description: string, schema: object, example: unknown) => ({ description, content: json(schema, example) });
const error = (code: number, description: string) => [String(code), response(description, ref("ErrorResponse"), { error: description })];
const errors = (...items: Array<[number, string]>) => Object.fromEntries(items.map(([code, label]) => error(code, label)));
const id = (name: string, description: string) => ({ name, in: "path", required: true, description, schema: { type: "integer", minimum: 1 }, example: 1 });
const body = (schema: string, example: object) => ({ required: true, content: json(ref(schema), example) });
const authErrors: Array<[number, string]> = [[401, "Authentification requise."], [403, "Accès interdit."]];

const childExample = { childId: 1, daycareId: 1, firstName: "Lina", lastName: "Durand", birthDate: "2023-05-14", isActive: true, groupName: "Petits", emergencyContactName: null, emergencyContactPhone: null };
const reportExample = { reportId: 2, childId: 1, reportDate: "2026-10-21", status: "DRAFT", publishedAt: null, summary: null, parentNote: "Journée calme.", summaryOverride: null, revision: 2, firstName: "Lina", lastName: "Durand", meals: [{ kind: "MAIN", intake: "MOST", label: "Purée de carottes" }], activities: ["Peinture"], naps: [{ napQualityId: 1, startTime: "13:00:00", endTime: "14:00:00", comment: null }], moods: [{ moodId: 1, observedTime: "09:30:00", comment: null }], diaperChanges: [{ diaperChangeTypeId: 1, changeTime: "11:00:00", comment: null }] };

export const p0F1Paths: Record<string, unknown> = {
  "/api/auth/login": { post: {
    tags: ["Auth"], summary: "Ouvrir une session de 12 heures.", operationId: "login",
    security: [], requestBody: body("LoginRequest", { email: "admin@carelia.test", password: "mot-de-passe-local" }),
    responses: { 200: {
      ...response("Session créée.", ref("LoginResponse"), { user: { userId: 1, daycareId: 1, role: "DAYCARE_ADMIN", email: "admin@carelia.test", firstName: "Alice", lastName: "Martin" } }),
      headers: { "Set-Cookie": { description: "carelia_session, HttpOnly, SameSite=Strict, durée de 12 heures.", schema: { type: "string" } } }
    },
      ...errors([400, "Corps invalide."], [401, "Identifiants invalides."], [500, "Erreur serveur."]) }
  } },
  "/api/auth/me": { get: {
    tags: ["Auth"], summary: "Lire l'utilisateur courant.", operationId: "currentUser",
    responses: { 200: response("Profil courant.", ref("Actor"), { userId: 1, daycareId: 1, role: "DAYCARE_ADMIN", email: "admin@carelia.test", firstName: "Alice", lastName: "Martin" }), ...errors([401, "Authentification requise."]) }
  } },
  "/api/auth/logout": { post: {
    tags: ["Auth"], summary: "Révoquer la session courante.", operationId: "logout",
    responses: { 204: { description: "Session révoquée et cookie supprimé." }, ...errors([401, "Authentification requise."]) }
  } },
  "/api/children": {
    get: { tags: ["Children"], summary: "Lister les enfants accessibles de la crèche.", operationId: "listChildren",
      parameters: [
        { name: "search", in: "query", required: false, description: "Recherche prénom et nom, 100 caractères maximum.", schema: { type: "string" }, example: "Lina" },
        { name: "groupName", in: "query", required: false, description: "Nom exact du groupe, 100 caractères maximum.", schema: { type: "string" }, example: "Petits" },
        { name: "active", in: "query", required: false, description: "Filtrer les fiches actives ou inactives.", schema: { type: "boolean" }, example: true }
      ],
      responses: { 200: response("Liste filtrée par rôle et lien parent-enfant.", { type: "array", items: ref("Child") }, [childExample]), ...errors([400, "Recherche invalide."], ...authErrors) } },
    post: { tags: ["Children"], summary: "Créer une fiche enfant (direction ou EJE).", operationId: "createChild",
      requestBody: body("CreateChildRequest", { firstName: "Lina", lastName: "Durand", birthDate: "2023-05-14", groupName: "Petits" }),
      responses: { 201: response("Enfant créé dans la crèche courante.", ref("Child"), childExample), ...errors([400, "Données invalides."], ...authErrors, [409, "Conflit de données."]) } }
  },
  "/api/children/{id}": {
    get: { tags: ["Children"], summary: "Lire une fiche enfant accessible.", operationId: "getChild", parameters: [id("id", "Identifiant de l'enfant.")],
      responses: { 200: response("Fiche enfant.", ref("Child"), childExample), ...errors([400, "Identifiant invalide."], ...authErrors, [404, "Enfant introuvable."]) } },
    patch: { tags: ["Children"], summary: "Modifier une fiche enfant (direction ou EJE).", operationId: "updateChild", parameters: [id("id", "Identifiant de l'enfant.")],
      requestBody: body("UpdateChildRequest", { groupName: "Moyens", isActive: true }),
      responses: { 200: response("Fiche mise à jour.", ref("Child"), childExample), ...errors([400, "Données invalides."], ...authErrors, [404, "Enfant introuvable."]) } }
  },
  "/api/children/{id}/parents": { get: {
    tags: ["Children"], summary: "Lister les parents liés à un enfant (personnel).", operationId: "listChildParents", parameters: [id("id", "Identifiant de l'enfant.")],
    responses: { 200: response("Parents liés.", { type: "array", items: ref("LinkedParent") }, [{ userId: 2, firstName: "Camille", lastName: "Durand", email: "parent@carelia.test", relationship: "PARENT" }]), ...errors([400, "Identifiant invalide."], ...authErrors, [404, "Enfant introuvable."]) }
  } },
  "/api/children/{id}/parents/{parentId}": {
    put: { tags: ["Children"], summary: "Créer ou mettre à jour le lien parent-enfant (direction).", operationId: "linkParent", parameters: [id("id", "Identifiant de l'enfant."), id("parentId", "Identifiant du parent.")],
      requestBody: body("ParentLinkRequest", { relationship: "PARENT" }),
      responses: { 204: { description: "Lien enregistré." }, ...errors([400, "Parent ou données invalides."], ...authErrors, [404, "Enfant introuvable."]) } },
    delete: { tags: ["Children"], summary: "Supprimer un lien parent-enfant (direction).", operationId: "unlinkParent", parameters: [id("id", "Identifiant de l'enfant."), id("parentId", "Identifiant du parent.")],
      responses: { 204: { description: "Lien supprimé." }, ...errors([400, "Identifiant invalide."], ...authErrors, [404, "Lien introuvable."]) } }
  },
  "/api/references": { get: {
    tags: ["References"], summary: "Lire les rôles, humeurs, qualités de sieste et types de change.", operationId: "listReferences",
    responses: { 200: response("Listes de référence.", ref("References"), { roles: [{ roleId: 1, label: "DAYCARE_ADMIN" }], napQualities: [{ napQualityId: 1, label: "GOOD" }], moods: [{ moodId: 1, label: "HAPPY" }], diaperChangeTypes: [{ diaperChangeTypeId: 1, label: "WET" }] }), ...errors([401, "Authentification requise."]) }
  } },
  "/api/notifications": { get: {
    tags: ["Notifications"], summary: "Lister les bulletins publiés envoyés au parent courant.", operationId: "listNotifications",
    responses: { 200: response("Cent dernières notifications des enfants encore liés au parent.", { type: "array", items: ref("ReportNotification") }, [{ notificationId: 1, reportId: 2, childId: 1, reportDate: "2026-10-21", childName: "Lina Durand", createdAt: "2026-10-21T10:00:00.000Z", readAt: null }]), ...errors(...authErrors) }
  } },
  "/api/notifications/{id}/read": { patch: {
    tags: ["Notifications"], summary: "Marquer une notification comme lue (parent destinataire).", operationId: "readNotification",
    parameters: [id("id", "Identifiant de la notification du parent courant.")],
    responses: { 204: { description: "Notification lue; opération idempotente." }, ...errors([400, "Identifiant invalide."], ...authErrors, [404, "Notification introuvable ou inaccessible."]) }
  } },
  "/api/reports": {
    get: { tags: ["Reports"], summary: "Historique paginé des bulletins visibles.", operationId: "listReports",
      parameters: [
        { name: "childId", in: "query", required: false, schema: { type: "integer", minimum: 1 }, example: 1, description: "Limiter à un enfant accessible." },
        { name: "date", in: "query", required: false, schema: { type: "string", format: "date" }, example: "2026-10-21", description: "Filtrer à une journée précise." },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 }, description: "Taille de page." },
        { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 }, description: "Décalage de page." }
      ],
      responses: { 200: response("Bulletins; un parent ne voit que les publications de ses enfants.", { type: "array", items: ref("Report") }, [reportExample]), ...errors([400, "Paramètre invalide."], ...authErrors, [404, "Enfant introuvable."]) } },
    post: { tags: ["Reports"], summary: "Créer le brouillon unique d'un enfant pour une date (personnel).", operationId: "createReport",
      requestBody: body("CreateReportRequest", { childId: 1, reportDate: "2026-10-21" }),
      responses: { 201: response("Brouillon créé.", ref("Report"), reportExample), ...errors([400, "Données invalides."], ...authErrors, [404, "Enfant introuvable."], [409, "Bulletin déjà créé pour cette date."]) } }
  },
  "/api/reports/{id}": {
    get: { tags: ["Reports"], summary: "Lire un bulletin et toutes ses observations.", operationId: "getReport", parameters: [id("id", "Identifiant du bulletin.")],
      responses: { 200: response("Bulletin détaillé.", ref("Report"), reportExample), ...errors([400, "Identifiant invalide."], ...authErrors, [404, "Bulletin introuvable."]) } },
    patch: { tags: ["Reports"], summary: "Enregistrer atomiquement le brouillon avec contrôle de révision.", operationId: "updateReport", parameters: [id("id", "Identifiant du bulletin.")],
      requestBody: body("UpdateReportRequest", { revision: 1, parentNote: "Journée calme.", meals: [{ kind: "MAIN", intake: "MOST", label: "Purée de carottes" }], activities: ["Peinture"], naps: [{ napQualityId: 1, startTime: "13:00", endTime: "14:00", comment: null }], moods: [{ moodId: 1, observedTime: "09:30", comment: null }], diaperChanges: [{ diaperChangeTypeId: 1, changeTime: "11:00", comment: null }] }),
      responses: { 200: response("Brouillon enregistré et révision incrémentée.", ref("Report"), reportExample), ...errors([400, "Données invalides."], ...authErrors, [404, "Bulletin introuvable."], [409, "Révision obsolète ou bulletin publié."]) } }
  },
  "/api/reports/{id}/preview": { get: {
    tags: ["Reports"], summary: "Prévisualiser le résumé automatique ou personnalisé.", operationId: "previewReport", parameters: [id("id", "Identifiant du bulletin.")],
    responses: { 200: response("Résumé prévisualisé.", { type: "object", properties: { summary: { type: "string" } } }, { summary: "La journée de Lina. Repas : Purée de carottes (bien)." }), ...errors([400, "Identifiant invalide."], ...authErrors, [404, "Bulletin introuvable."]) }
  } },
  "/api/reports/{id}/publish": { post: {
    tags: ["Reports"], summary: "Publier définitivement aux parents (direction ou EJE).", operationId: "publishReport", parameters: [id("id", "Identifiant du bulletin.")],
    requestBody: body("PublishReportRequest", { revision: 2 }),
    responses: { 200: response("Bulletin publié, résumé figé, auteur et horodatage enregistrés.", ref("Report"), { ...reportExample, status: "PUBLISHED", publishedAt: "2026-10-21T10:00:00.000Z" }), ...errors([400, "Révision invalide."], ...authErrors, [404, "Bulletin introuvable."], [409, "Révision obsolète ou bulletin déjà publié."]) }
  } }
};

const positive = { type: "integer", minimum: 1 };
const optionalText = (maxLength: number) => ({ type: "string", nullable: true, maxLength });
export const p0F1Schemas = {
  Actor: { type: "object", required: ["userId", "daycareId", "role", "email", "firstName", "lastName"], properties: { userId: positive, daycareId: positive, role: { type: "string", enum: ["DAYCARE_ADMIN", "EJE", "AUXILIARY", "PARENT"] }, email: { type: "string", format: "email" }, firstName: { type: "string" }, lastName: { type: "string" } } },
  LoginRequest: { type: "object", required: ["email", "password"], additionalProperties: false, properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" } } },
  LoginResponse: { type: "object", required: ["user"], properties: { user: ref("Actor") } },
  Child: { type: "object", required: ["childId", "daycareId", "firstName", "lastName", "birthDate", "isActive"], properties: { childId: positive, daycareId: positive, firstName: { type: "string" }, lastName: { type: "string" }, birthDate: { type: "string", format: "date" }, isActive: { type: "boolean" }, groupName: optionalText(100), emergencyContactName: optionalText(150), emergencyContactPhone: optionalText(30) } },
  CreateChildRequest: { type: "object", required: ["firstName", "lastName", "birthDate"], additionalProperties: false, properties: { firstName: { type: "string", maxLength: 100 }, lastName: { type: "string", maxLength: 100 }, birthDate: { type: "string", format: "date" }, groupName: optionalText(100), emergencyContactName: optionalText(150), emergencyContactPhone: optionalText(30) } },
  UpdateChildRequest: { type: "object", minProperties: 1, additionalProperties: false, properties: { firstName: { type: "string" }, lastName: { type: "string" }, birthDate: { type: "string", format: "date" }, isActive: { type: "boolean" }, groupName: optionalText(100), emergencyContactName: optionalText(150), emergencyContactPhone: optionalText(30) } },
  LinkedParent: { type: "object", properties: { userId: positive, firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string", format: "email" }, relationship: { type: "string" } } },
  ParentLinkRequest: { type: "object", required: ["relationship"], additionalProperties: false, properties: { relationship: { type: "string", maxLength: 50 } } },
  References: { type: "object", properties: { roles: { type: "array", items: { type: "object", properties: { roleId: positive, label: { type: "string" } } } }, napQualities: { type: "array", items: { type: "object", properties: { napQualityId: positive, label: { type: "string" } } } }, moods: { type: "array", items: { type: "object", properties: { moodId: positive, label: { type: "string" } } } }, diaperChangeTypes: { type: "array", items: { type: "object", properties: { diaperChangeTypeId: positive, label: { type: "string" } } } } } },
  ReportNotification: { type: "object", required: ["notificationId", "reportId", "childId", "reportDate", "childName", "createdAt", "readAt"], properties: { notificationId: positive, reportId: positive, childId: positive, reportDate: { type: "string", format: "date" }, childName: { type: "string" }, createdAt: { type: "string", format: "date-time" }, readAt: { type: "string", format: "date-time", nullable: true } } },
  Meal: { type: "object", required: ["kind", "intake"], properties: { kind: { type: "string", enum: ["MAIN", "DESSERT", "SNACK"] }, intake: { type: "string", enum: ["ALL", "MOST", "LITTLE", "NONE"] }, label: optionalText(150) } },
  ReportNap: { type: "object", required: ["napQualityId", "startTime", "endTime"], properties: { napQualityId: positive, startTime: { type: "string", example: "13:00" }, endTime: { type: "string", example: "14:00" }, comment: optionalText(2000), qualityLabel: { type: "string", readOnly: true } } },
  ReportMood: { type: "object", required: ["moodId", "observedTime"], properties: { moodId: positive, observedTime: { type: "string", example: "09:30" }, comment: optionalText(2000), moodLabel: { type: "string", readOnly: true } } },
  ReportChange: { type: "object", required: ["diaperChangeTypeId", "changeTime"], properties: { diaperChangeTypeId: positive, changeTime: { type: "string", example: "11:00" }, comment: optionalText(2000), typeLabel: { type: "string", readOnly: true } } },
  Report: { type: "object", properties: { reportId: positive, childId: positive, reportDate: { type: "string", format: "date" }, status: { type: "string", enum: ["DRAFT", "PUBLISHED", "ARCHIVED"] }, publishedAt: { type: "string", format: "date-time", nullable: true }, publishedBy: { type: "array", items: { type: "object", properties: { userId: positive, firstName: { type: "string" }, lastName: { type: "string" } } } }, summary: optionalText(10000), parentNote: optionalText(5000), summaryOverride: optionalText(10000), revision: positive, firstName: { type: "string" }, lastName: { type: "string" }, meals: { type: "array", items: ref("Meal") }, activities: { type: "array", items: { type: "string" } }, naps: { type: "array", items: ref("ReportNap") }, moods: { type: "array", items: ref("ReportMood") }, diaperChanges: { type: "array", items: ref("ReportChange") } } },
  CreateReportRequest: { type: "object", required: ["childId", "reportDate"], additionalProperties: false, properties: { childId: positive, reportDate: { type: "string", format: "date" } } },
  UpdateReportRequest: { type: "object", required: ["revision"], additionalProperties: false, properties: { revision: positive, parentNote: optionalText(5000), summaryOverride: optionalText(10000), meals: { type: "array", items: ref("Meal"), maxItems: 3 }, activities: { type: "array", items: { type: "string", maxLength: 100 }, maxItems: 20 }, naps: { type: "array", items: ref("ReportNap") }, moods: { type: "array", items: ref("ReportMood") }, diaperChanges: { type: "array", items: ref("ReportChange") } } },
  PublishReportRequest: { type: "object", required: ["revision"], additionalProperties: false, properties: { revision: positive } }
};
