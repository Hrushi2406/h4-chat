import {
  Description,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { XIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "./button";

export interface IModal {
  isOpen: boolean;
  size?: "md" | "lg" | "sm" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";
  closeModal: any;
  clickOutsideToClose?: boolean;
  children: React.ReactNode;
  className?: string;
}

const getSizeClass = (size: string) => {
  switch (size) {
    case "sm":
      return "max-w-sm";
    case "md":
      return "max-w-md";
    case "lg":
      return "max-w-lg";
    case "xl":
      return "max-w-xl";
    case "2xl":
      return "max-w-2xl";
    case "3xl":
      return "max-w-3xl";
    case "4xl":
      return "max-w-4xl";
    case "5xl":
      return "max-w-5xl";
    case "6xl":
      return "max-w-6xl";
    default:
      return "max-w-lg";
  }
};

export default function Modal({
  isOpen,
  closeModal,
  clickOutsideToClose = true,
  size = "lg",
  children,
  className = "bg-white dark:bg-black rounded-2xl p-6",
}: IModal) {
  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={clickOutsideToClose ? closeModal : () => {}}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <DialogBackdrop className="fixed inset-0 bg-black/30 dark:bg-white/10 backdrop-blur-sm" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-0 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel
                  className={`w-full ${getSizeClass(
                    size
                  )} transform overflow-hidden text-left align-middle shadow-xl transition-all ${className} `}
                >
                  {children}
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
