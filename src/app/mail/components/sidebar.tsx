"use client";
import { api } from "@/trpc/react";
import { File, Inbox, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { Nav } from "./nav";

type Props = { isCollapsed: boolean };

const SideBar = ({ isCollapsed }: Props) => {
  const [tab] = useLocalStorage("normalhuman-tab", "inbox");
  const [accountId] = useLocalStorage("accountId", "");
  const [isSyncing, setIsSyncing] = useState(false);
  const trpcUtils = api.useUtils();

  // Utiliser useMutation pour syncEmails
  const syncEmailsMutation = api.mail.syncEmails.useMutation();

  console.group("SideBar Initialization");
  console.log("AccountId:", accountId || "Not set");
  console.log("Tab:", tab);
  console.groupEnd();

  useEffect(() => {
    const syncData = async () => {
      if (accountId && !isSyncing) {
        try {
          console.log("🔄 Starting sync for account:", accountId);
          setIsSyncing(true);
          await syncEmailsMutation.mutateAsync({ accountId });
          console.log("✅ Sync completed");
          await trpcUtils.mail.getNumThreads.invalidate();
        } catch (error) {
          console.error("❌ Sync failed:", error);
        } finally {
          setIsSyncing(false);
        }
      }
    };

    syncData();
    const syncInterval = setInterval(syncData, 30000);
    return () => clearInterval(syncInterval);
  }, [accountId, trpcUtils.mail.getNumThreads, isSyncing, syncEmailsMutation]);

  useEffect(() => {
    if (!accountId) {
      console.warn("⚠️ AccountId is missing - queries will not run");
    }
    if (!tab) {
      console.warn("⚠️ Tab is missing - queries will not run");
    }
  }, [accountId, tab]);

  const refetchInterval = 5000;

  const inboxQuery = api.mail.getNumThreads.useQuery(
    { accountId, tab: "inbox" },
    {
      enabled: !!accountId && !!tab,
      refetchInterval,
    },
  );

  const draftsQuery = api.mail.getNumThreads.useQuery(
    { accountId, tab: "drafts" },
    {
      enabled: !!accountId && !!tab,
      refetchInterval,
    },
  );

  const sentQuery = api.mail.getNumThreads.useQuery(
    { accountId, tab: "sent" },
    {
      enabled: !!accountId && !!tab,
      refetchInterval,
    },
  );

  useEffect(() => {
    console.group("Query States");
    console.log("Inbox:", {
      data: inboxQuery.data,
      loading: inboxQuery.isLoading,
      error: inboxQuery.error?.message,
    });
    console.log("Drafts:", {
      data: draftsQuery.data,
      loading: draftsQuery.isLoading,
      error: draftsQuery.error?.message,
    });
    console.log("Sent:", {
      data: sentQuery.data,
      loading: sentQuery.isLoading,
      error: sentQuery.error?.message,
    });
    console.groupEnd();
  }, [inboxQuery, draftsQuery, sentQuery]);

  return (
    <>
      <Nav
        isCollapsed={isCollapsed}
        links={[
          {
            title: "Inbox",
            label: inboxQuery.isLoading
              ? "..."
              : isSyncing
                ? "🔄"
                : inboxQuery.data?.toString() || "0",
            icon: Inbox,
            variant: tab === "inbox" ? "default" : "ghost",
          },
          {
            title: "Drafts",
            label: draftsQuery.isLoading
              ? "..."
              : isSyncing
                ? "🔄"
                : draftsQuery.data?.toString() || "0",
            icon: File,
            variant: tab === "drafts" ? "default" : "ghost",
          },
          {
            title: "Sent",
            label: sentQuery.isLoading
              ? "..."
              : isSyncing
                ? "🔄"
                : sentQuery.data?.toString() || "0",
            icon: Send,
            variant: tab === "sent" ? "default" : "ghost",
          },
        ]}
      />
    </>
  );
};

export default SideBar;
