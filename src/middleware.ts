import { db } from "@/server/db";
import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/initial-sync(.*)",
  "/api/aurinko/webhook(.*)",
  "/api/stripe(.*)",
  "/privacy",
  "/terms-of-service",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    auth().protect();

    const userId = auth().userId;
    if (userId) {
      try {
        // Récupérer l'utilisateur Clerk
        const clerkUser = await clerkClient.users.getUser(userId);
        const primaryEmail = clerkUser.emailAddresses.find(
          (email) => email.id === clerkUser.primaryEmailAddressId,
        );

        if (!primaryEmail?.emailAddress) {
          console.error("No primary email found for user:", userId);
          return;
        }

        // Upsert utilisateur avec tous les champs du modèle
        await db.user.upsert({
          where: {
            id: userId,
          },
          update: {
            emailAddress: primaryEmail.emailAddress,
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            imageUrl: clerkUser.imageUrl,
            // Les champs optionnels ne sont mis à jour que s'ils existent
            ...(clerkUser.publicMetadata?.stripeSubscriptionId && {
              stripeSubscriptionId: clerkUser.publicMetadata
                .stripeSubscriptionId as string,
            }),
          },
          create: {
            id: userId,
            emailAddress: primaryEmail.emailAddress,
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            imageUrl: clerkUser.imageUrl,
            role: "user",
            // Initialisation des relations si nécessaire
            stripeSubscriptionId: null,
            // Les champs accounts et chatbotInteraction seront créés automatiquement
            // quand nécessaire via leurs propres logiques métier
          },
        });

        console.log("User synchronized successfully:", userId);
      } catch (error) {
        console.error("Error syncing user:", error);
      }
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
