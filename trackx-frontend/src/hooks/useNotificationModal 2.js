import { useState, useCallback } from "react";

const createModalState = (overrides = {}) => ({
  isOpen: false,
  title: "",
  description: "",
  variant: "info",
  primaryAction: null,
  secondaryAction: null,
  ...overrides,
});

export default function useNotificationModal() {
  const [modalState, setModalState] = useState(() => createModalState());

  const openModal = useCallback((options = {}) => {
    setModalState(createModalState({ ...options, isOpen: true }));
  }, []);

  const closeModal = useCallback(() => {
    setModalState((prev) => {
      if (!prev.isOpen) {
        return prev;
      }
      return createModalState();
    });
  }, []);

  return { modalState, openModal, closeModal };
}
