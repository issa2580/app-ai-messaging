"use server";
import { FREE_ACCOUNTS_PER_USER, PRO_ACCOUNTS_PER_USER } from "@/app/constants";
import { db } from "@/server/db";
import { auth, clerkClient } from "@clerk/nextjs/server";
import axios from "axios";
import { getSubscriptionStatus } from "./stripe-actions";
import type { EmailMessage } from "./types";

type AurinkoServiceType = "Google" | "Office365";

async function ensureUserExists(userId: string) {
  const existingUser = await db.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId,
    );

    if (!primaryEmail?.emailAddress) {
      throw new Error("No primary email found for user");
    }

    await db.user.create({
      data: {
        id: userId,
        emailAddress: primaryEmail.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
        role: "user",
      },
    });

    console.log("User created successfully:", userId);
  }

  return existingUser;
}

export const getAurinkoAuthorizationUrl = async (
  serviceType: AurinkoServiceType, // Utiliser le nouveau type
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  try {
    await ensureUserExists(userId);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new Error("Failed to create user");
    }

    const isSubscribed = await getSubscriptionStatus();

    const accounts = await db.account.count({
      where: { userId },
    });

    if (user.role === "user") {
      if (isSubscribed) {
        if (accounts >= PRO_ACCOUNTS_PER_USER) {
          throw new Error(
            "You have reached the maximum number of accounts for your subscription",
          );
        }
      } else {
        if (accounts >= FREE_ACCOUNTS_PER_USER) {
          throw new Error(
            "You have reached the maximum number of accounts for your subscription",
          );
        }
      }
    }

    const params = new URLSearchParams({
      clientId: process.env.AURINKO_CLIENT_ID as string,
      serviceType,
      scopes: "Mail.Read Mail.ReadWrite Mail.Send Mail.Drafts Mail.All",
      responseType: "code",
      returnUrl: `${process.env.NEXT_PUBLIC_URL}/api/aurinko/callback`,
    });

    return `https://api.aurinko.io/v1/auth/authorize?${params.toString()}`;
  } catch (error) {
    console.error("Error in getAurinkoAuthorizationUrl:", error);
    throw error;
  }
};

export const getAurinkoToken = async (code: string) => {
  try {
    const response = await axios.post(
      `https://api.aurinko.io/v1/auth/token/${code}`,
      {},
      {
        auth: {
          username: process.env.AURINKO_CLIENT_ID as string,
          password: process.env.AURINKO_CLIENT_SECRET as string,
        },
      },
    );

    return response.data as {
      accountId: number;
      accessToken: string;
      userId: string;
      userSession: string;
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error fetching Aurinko token:", error.response?.data);
    } else {
      console.error("Unexpected error fetching Aurinko token:", error);
    }
  }
};

export const getAccountDetails = async (accessToken: string) => {
  try {
    const response = await axios.get("https://api.aurinko.io/v1/account", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data as {
      email: string;
      name: string;
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error fetching account details:", error.response?.data);
    } else {
      console.error("Unexpected error fetching account details:", error);
    }
    throw error;
  }
};

export const getEmailDetails = async (accessToken: string, emailId: string) => {
  try {
    const response = await axios.get<EmailMessage>(
      `https://api.aurinko.io/v1/email/messages/${emailId}`,
      {
        params: {
          loadInlines: true,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error fetching email details:", error.response?.data);
    } else {
      console.error("Unexpected error fetching email details:", error);
    }
    throw error;
  }
};
