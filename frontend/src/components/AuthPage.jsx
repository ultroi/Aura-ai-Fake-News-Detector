import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import "../styles/AuthPage.css";
import apiClient from "../services/authService";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

const AuthPage = ({ onContinue, onBack }) => {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const googleClientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  const currentOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : "";

  const frontendOrigin =
    currentOrigin ||
    import.meta.env.VITE_FRONTEND_URL ||
    "";

  const enableGoogle =
    import.meta.env.VITE_ENABLE_GOOGLE !== "false";

  const localOrigins = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:5173",
  ]);

  const allowGoogle =
    Boolean(googleClientId) &&
    enableGoogle &&
    (
      !currentOrigin ||
      currentOrigin === frontendOrigin ||
      localOrigins.has(currentOrigin)
    );

  const clearError = () => {
    if (error) {
      setError("");
    }
  };

  const switchMode = (nextMode) => {
    if (loading || nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const validateCommon = () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      return "Please enter your email address.";
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return "Please enter a valid email address.";
    }

    if (!password) {
      return "Please enter your password.";
    }

    if (password.length < 8) {
      return "Password must be at least 8 characters.";
    }

    return "";
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    clearError();
    setLoading(true);

    try {
      if (!credentialResponse?.credential) {
        throw new Error(
          "No credential received from Google."
        );
      }

      const response =
        await apiClient.googleLogin(
          credentialResponse.credential
        );

      onContinue(response.data.user);
    } catch (err) {
      setError(
        err.message ||
          "Google sign-in failed. Please try again."
      );
      console.error(
        "Google login error:",
        err
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError(
      "Google sign-in failed. Please try again."
    );
  };

  const handleLogin = async () => {
    const validationError =
      validateCommon();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    clearError();

    try {
      const response =
        await apiClient.emailPasswordLogin(
          email.trim(),
          password
        );

      onContinue(response.data.user);
    } catch (err) {
      setError(
        err.message ||
          "Email/password login failed."
      );
      console.error(
        "Email login error:",
        err
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    const normalizedName = name.trim();

    if (!normalizedName) {
      setError("Please enter your name.");
      return;
    }

    const validationError =
      validateCommon();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    clearError();

    try {
      const response = await fetch(
        `${API_URL}/auth/register`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: normalizedName,
            username: normalizedName,
            email:
              email.trim(),
            password,
          }),
        }
      );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            payload?.message ||
            "Account creation failed."
        );
      }

      const user =
        payload?.data?.user ||
        payload?.user;

      if (!user) {
        throw new Error(
          "Account created, but the user response was invalid."
        );
      }

      onContinue(user);
    } catch (err) {
      setError(
        err.message ||
          "Account creation failed."
      );
      console.error(
        "Signup error:",
        err
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (mode === "login") {
      await handleLogin();
    } else {
      await handleSignup();
    }
  };

  const title =
    mode === "login"
      ? "Welcome back."
      : "Create your account.";

  const description =
    mode === "login"
      ? "Sign in to continue to your Aura AI workspace."
      : "Create an account to save your research and continue your conversations.";

  return (
    <main className="auth-page">
      <div className="auth-page__shell">
        <header className="auth-header">
          <a
            className="auth-brand"
            href="/"
            aria-label="Aura AI home"
          >
            <span
              className="auth-brand__mark"
              aria-hidden="true"
            >
              <img
                src="/aura_ai.png"
                alt=""
              />
            </span>

            <span className="auth-brand__name">
              Aura AI
            </span>
          </a>

          {onBack && (
            <button
              className="auth-header__back"
              type="button"
              onClick={onBack}
              disabled={loading}
            >
              <span aria-hidden="true">
                ←
              </span>
              Back
            </button>
          )}
        </header>

        <section
          className="auth-card"
          aria-labelledby="auth-title"
        >
          <div className="auth-card__intro">
            <p className="auth-card__eyebrow">
              Research workspace
            </p>

            <h1
              className="auth-card__title"
              id="auth-title"
            >
              {title}
            </h1>

            <p className="auth-card__description">
              {description}
            </p>
          </div>

          <div
            className="auth-switch"
            role="tablist"
            aria-label="Authentication mode"
          >
            <button
              className={
                mode === "login"
                  ? "auth-switch__tab auth-switch__tab--active"
                  : "auth-switch__tab"
              }
              type="button"
              role="tab"
              aria-selected={
                mode === "login"
              }
              onClick={() =>
                switchMode("login")
              }
              disabled={loading}
            >
              Log in
            </button>

            <button
              className={
                mode === "signup"
                  ? "auth-switch__tab auth-switch__tab--active"
                  : "auth-switch__tab"
              }
              type="button"
              role="tab"
              aria-selected={
                mode === "signup"
              }
              onClick={() =>
                switchMode("signup")
              }
              disabled={loading}
            >
              Sign up
            </button>
          </div>

          <div className="auth-google">
            {allowGoogle ? (
              <div className="auth-google__button">
                <GoogleLogin
                  onSuccess={
                    handleGoogleSuccess
                  }
                  onError={
                    handleGoogleError
                  }
                  locale="en"
                  theme="outline"
                  size="large"
                  shape="rectangular"
                  text={
                    mode === "login"
                      ? "continue_with"
                      : "signup_with"
                  }
                />
              </div>
            ) : (
              <div
                className="auth-google__disabled"
                role="note"
              >
                Google sign-in is disabled
                for this origin.
              </div>
            )}
          </div>

          <div
            className="auth-divider"
            aria-hidden="true"
          >
            <span>
              {mode === "login"
                ? "or continue with email"
                : "or create with email"}
            </span>
          </div>

          <form
            className={
              mode === "login"
                ? "auth-form auth-form--login"
                : "auth-form auth-form--signup"
            }
            onSubmit={handleSubmit}
            noValidate
          >
            {mode === "signup" && (
              <div
                className="auth-field auth-field--name"
                key="name"
              >
                <label
                  htmlFor="auth-name"
                >
                  Name
                </label>

                <input
                  id="auth-name"
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => {
                    setName(
                      event.target.value
                    );
                    clearError();
                  }}
                  disabled={loading}
                />
              </div>
            )}

            <div
              className="auth-field"
              key="email"
            >
              <label htmlFor="auth-email">
                Email address
              </label>

              <input
                id="auth-email"
                className="auth-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(
                    event.target.value
                  );
                  clearError();
                }}
                disabled={loading}
              />
            </div>

            <div
              className="auth-field"
              key="password"
            >
              <div className="auth-field__label-row">
                <label htmlFor="auth-password">
                  Password
                </label>

                <span>
                  Minimum 8 characters
                </span>
              </div>

              <div className="auth-password">
                <input
                  id="auth-password"
                  className="auth-input"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => {
                    setPassword(
                      event.target.value
                    );
                    clearError();
                  }}
                  disabled={loading}
                />

                <button
                  className="auth-password__toggle"
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (visible) =>
                        !visible
                    )
                  }
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  aria-pressed={
                    showPassword
                  }
                >
                  {showPassword
                    ? "Hide"
                    : "Show"}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div
                className="auth-field auth-field--confirm"
                key="confirm-password"
              >
                <label htmlFor="auth-confirm-password">
                  Confirm password
                </label>

                <div className="auth-password">
                  <input
                    id="auth-confirm-password"
                    className="auth-input"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    value={
                      confirmPassword
                    }
                    onChange={(event) => {
                      setConfirmPassword(
                        event.target.value
                      );
                      clearError();
                    }}
                    disabled={loading}
                  />

                  <button
                    className="auth-password__toggle"
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (visible) =>
                          !visible
                      )
                    }
                    disabled={loading}
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                    aria-pressed={
                      showConfirmPassword
                    }
                  >
                    {showConfirmPassword
                      ? "Hide"
                      : "Show"}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div
                className="auth-message"
                role="alert"
              >
                <span
                  className="auth-message__mark"
                  aria-hidden="true"
                >
                  !
                </span>

                <span>{error}</span>
              </div>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={loading}
            >
              <span>
                {loading
                  ? mode === "login"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "login"
                    ? "Continue with Email"
                    : "Create account"}
              </span>

              <span aria-hidden="true">
                {loading ? "…" : "→"}
              </span>
            </button>
          </form>

          <p className="auth-footer">
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}

            <button
              className="auth-footer__switch"
              type="button"
              onClick={() =>
                switchMode(
                  mode === "login"
                    ? "signup"
                    : "login"
                )
              }
              disabled={loading}
            >
              {mode === "login"
                ? "Sign up"
                : "Log in"}
            </button>
          </p>

          <p className="auth-legal">
            By continuing, you agree to our{" "}
            <a href="#">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#">
              Privacy Policy
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
};

export default AuthPage;
