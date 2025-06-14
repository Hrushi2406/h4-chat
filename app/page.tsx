"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  Home,
  Search,
  Settings,
  Star,
  User,
} from "lucide-react";

export default function ComponentShowcase() {
  const [progress, setProgress] = useState(33);
  const [switchValue, setSwitchValue] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Component Showcase
              </h1>
              <p className="text-muted-foreground mt-2">
                A comprehensive collection of available shadcn/ui components
              </p>
            </div>
            <Badge variant="secondary">shadcn/ui</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-8">
          {/* Buttons Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold">Buttons</h2>
              <Badge>Interactive</Badge>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Button Variants</CardTitle>
                <CardDescription>
                  Different button styles and states
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Button>Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                  <Button disabled>Disabled</Button>
                  <Button size="sm">Small</Button>
                  <Button size="lg">Large</Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Form Elements */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold">Form Elements</h2>
              <Badge variant="outline">Input</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Input Components</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Type your message here."
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="notifications"
                      checked={switchValue}
                      onCheckedChange={setSwitchValue}
                    />
                    <Label htmlFor="notifications">Enable notifications</Label>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Select & Toggle</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Framework</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a framework" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="react">React</SelectItem>
                        <SelectItem value="vue">Vue</SelectItem>
                        <SelectItem value="angular">Angular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Alignment</Label>
                    <ToggleGroup type="single" defaultValue="center">
                      <ToggleGroupItem value="left">Left</ToggleGroupItem>
                      <ToggleGroupItem value="center">Center</ToggleGroupItem>
                      <ToggleGroupItem value="right">Right</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <Toggle>
                    <Star className="h-4 w-4" />
                    Toggle
                  </Toggle>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Display Components */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold">Display Components</h2>
              <Badge variant="secondary">Visual</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Alerts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Heads up!</AlertTitle>
                    <AlertDescription>
                      This is a default alert message.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Badges & Avatar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src="https://github.com/shadcn.png" />
                      <AvatarFallback>CN</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">John Doe</p>
                      <p className="text-xs text-muted-foreground">
                        john@example.com
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Progress & Loading</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                  <div className="space-y-2">
                    <Label>Loading Skeleton</Label>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Layout Components */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold">Layout Components</h2>
              <Badge variant="outline">Structure</Badge>
            </div>
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Tabs</CardTitle>
                  <CardDescription>Organize content with tabs</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="analytics">Analytics</TabsTrigger>
                      <TabsTrigger value="reports">Reports</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="mt-4 space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Overview Content</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground">
                            This is the overview tab content with summary
                            information.
                          </p>
                        </CardContent>
                      </Card>
                    </TabsContent>
                    <TabsContent value="analytics" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Analytics</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground">
                            Analytics data and charts would go here.
                          </p>
                        </CardContent>
                      </Card>
                    </TabsContent>
                    <TabsContent value="reports" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Reports</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground">
                            Generated reports and export options.
                          </p>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Accordion</CardTitle>
                  <CardDescription>
                    Collapsible content sections
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
                      <AccordionTrigger>Is it accessible?</AccordionTrigger>
                      <AccordionContent>
                        Yes. It adheres to the WAI-ARIA design pattern and is
                        fully accessible.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                      <AccordionTrigger>Is it styled?</AccordionTrigger>
                      <AccordionContent>
                        Yes. It comes with default styles that matches the other
                        components.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3">
                      <AccordionTrigger>Is it animated?</AccordionTrigger>
                      <AccordionContent>
                        Yes. Its animated by default, but you can disable it if
                        you prefer.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Interactive Components */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold">Interactive Components</h2>
              <Badge>Interactive</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Dialog & Tooltip</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Open Dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Example Dialog</DialogTitle>
                        <DialogDescription>
                          This is an example dialog component with a title and
                          description.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="name" className="text-right">
                            Name
                          </Label>
                          <Input
                            id="name"
                            value="John Doe"
                            className="col-span-3"
                          />
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline">Hover for tooltip</Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This is a helpful tooltip</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Utility Components</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Separator</Label>
                    <div className="flex items-center my-2">
                      <span className="text-sm">Before</span>
                      <Separator className="mx-4" />
                      <span className="text-sm">After</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setProgress((prev) => Math.min(100, prev + 10))
                      }
                    >
                      Increase Progress
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setProgress((prev) => Math.max(0, prev - 10))
                      }
                    >
                      Decrease Progress
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Component Summary */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Available Components</h2>
            <Card>
              <CardHeader>
                <CardTitle>Component Library Overview</CardTitle>
                <CardDescription>
                  All available shadcn/ui components in this project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {[
                    "Accordion",
                    "Alert",
                    "Avatar",
                    "Badge",
                    "Button",
                    "Calendar",
                    "Card",
                    "Dialog",
                    "Dropdown Menu",
                    "Form",
                    "Input",
                    "Label",
                    "Modal",
                    "Popover",
                    "Progress",
                    "Scroll Area",
                    "Select",
                    "Separator",
                    "Sheet",
                    "Skeleton",
                    "Sonner",
                    "Switch",
                    "Table",
                    "Tabs",
                    "Textarea",
                    "Toggle",
                    "Toggle Group",
                    "Tooltip",
                    "Sidebar",
                  ].map((component) => (
                    <div
                      key={component}
                      className="flex items-center gap-2 p-2 rounded-md border"
                    >
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">{component}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                <p className="text-sm text-muted-foreground">
                  Total: 29 components available • Built with Radix UI
                  primitives • Fully customizable with Tailwind CSS
                </p>
              </CardFooter>
            </Card>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Component Showcase • Built with Next.js, shadcn/ui, and Tailwind
              CSS
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Next.js 15</Badge>
              <Badge variant="outline">shadcn/ui</Badge>
              <Badge variant="outline">Tailwind CSS</Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
