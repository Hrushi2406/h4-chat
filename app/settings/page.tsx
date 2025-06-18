"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronLeft,
  Circle,
  Diamond,
  Loader2,
  Pentagon,
  Save,
} from "lucide-react";
import Link from "next/link";
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/hooks/user/use-user";
import { useUserActions } from "@/lib/hooks/user/use-user-actions";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

export default function SettingsPage() {
  return (
    <div className="container py-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex-1">
          <Button variant="outline" className="mb-6 " asChild>
            <Link href="/">
              <ChevronLeft className="w-4 h-4 " />
              Back to chat
            </Link>
          </Button>
        </div>

        <h1 className="text-lg font-bold mb-6 text-center">Settings</h1>
        <div className="flex-1"></div>
      </div>

      <Tabs defaultValue="account" className="w-full ">
        <TabsList className="bg-white mb-1">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="customization">Customization</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Card>
            <CardContent className="">
              <AccountSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="customization">
          <Card>
            <CardContent className="">
              <CustomizationSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const AccountSettings = () => {
  const { data: user } = useUser();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Account Settings</h2>
      <div className="grid gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full overflow-hidden">
            {user?.avatar ? (
              <img
                src={user.avatar}
                loading="lazy"
                alt={user?.name || "User avatar"}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src =
                    "https://via.placeholder.com/150?text=Error";
                }}
              />
            ) : (
              <div className="h-full w-full bg-muted flex items-center justify-center">
                <span className="text-xl font-medium text-muted-foreground">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || "?"}
                </span>
              </div>
            )}
          </div>
          <div>
            <p className="font-medium">{user?.name || "Anonymous User"}</p>
            <p className="text-sm text-muted-foreground">
              {user?.email || "No email provided"}
            </p>
          </div>
          <div className="ml-auto">
            <div className="flex justify-between items-center mb-0">
              <p className="text-xs text-muted-foreground ">Usage</p>
              <div className="flex justify-end text-xs text-muted-foreground">
                {80}/400
              </div>
            </div>

            <div className="flex justify-between items-center mb-2"> </div>
            <Progress value={25} max={400} className="w-48 h-1.5" />
            <p className="text-xs mt-2 text-right text-muted-foreground">
              Demo usage
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const CustomizationSettings = () => {
  const { data: user } = useUser();
  const { updateUser } = useUserActions();
  const [name, setName] = React.useState(user?.name || "");
  const [occupation, setOccupation] = React.useState(user?.occupation || "");
  const [userPreferences, setUserPreferences] = React.useState(
    user?.userPreferences || ""
  );

  React.useEffect(() => {
    if (user) {
      setName(user.name || "");
      setOccupation(user.occupation || "");
      setUserPreferences(user.userPreferences || "");
    }
  }, [user]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value.slice(0, 50));
  };

  const handleOccupationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOccupation(e.target.value.slice(0, 50));
  };

  const handleUserPreferencesChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setUserPreferences(e.target.value.slice(0, 500));
  };

  const handleSaveChanges = (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.uid) return;

    updateUser.mutate({
      uid: user.uid,
      update: {
        name,
        occupation,
        userPreferences,
      },
    });
  };

  return (
    <div className="">
      <h2 className="text-xl font-semibold mb-6">Customization Settings</h2>
      <form onSubmit={handleSaveChanges} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-name">What should Saaki Chat call you?</Label>
          <div className="flex flex-col gap-1">
            <Input
              id="display-name"
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your name"
              maxLength={50}
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {name.length}/50
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="occupation">What do you do?</Label>
          <div className="flex flex-col gap-1">
            <Input
              id="occupation"
              value={occupation}
              onChange={handleOccupationChange}
              placeholder="Indie Hacker, Designer, Developer, etc."
              maxLength={50}
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {occupation.length}/50
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="additional-info">
            Anything else you'd like us to know?
          </Label>
          <div className="flex flex-col gap-1">
            <Textarea
              id="additional-info"
              value={userPreferences}
              onChange={handleUserPreferencesChange}
              placeholder="I love buying new domains every week..."
              maxLength={500}
              className="min-h-[100px] text-sm placeholder:text-sm"
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">
                {userPreferences.length}/500
              </span>
            </div>
          </div>
        </div>
        <div className="pt-4 flex justify-end">
          <Button
            type="submit"
            disabled={updateUser.isPending}
            className="w-full sm:w-auto"
          >
            {updateUser.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin " />
            ) : (
              <Save className="w-4 h-4 " />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
};
