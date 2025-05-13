import { createContext, useEffect, useState, useContext } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("AuthContext: Initializing onAuthStateChanged...");

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthContext: Auth state changed. currentUser:", currentUser);

      if (currentUser) {
        try {
          console.log("AuthContext: Forcing token refresh...");
          await currentUser.getIdToken(true);

          console.log("AuthContext: Reloading user to get fresh emailVerified...");
          await currentUser.reload();

          console.log("AuthContext: Reload complete. Email verified:", currentUser.emailVerified);

          console.log("AuthContext: Fetching Firestore profile for UID:", currentUser.uid);
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            console.log("AuthContext: Profile document found:", docSnap.data());
            setUser(currentUser);
            setProfile(docSnap.data());
          } else {
            console.warn("AuthContext: Profile not found in Firestore.");
            setUser(currentUser);
            setProfile(null);
          }
        } catch (error) {
          console.error("AuthContext: Error during user setup:", error);
          setUser(null);
          setProfile(null);
        }
      } else {
        console.log("AuthContext: No user is logged in.");
        setUser(null);
        setProfile(null);
      }

      console.log("AuthContext: Finished processing auth state.");
      setLoading(false);
    });

    return () => {
      console.log("AuthContext: Cleaning up listener.");
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
