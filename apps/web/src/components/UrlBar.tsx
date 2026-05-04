import { useState, type ChangeEventHandler, type FormEventHandler } from "react";

const DEFAULT_URL = "https://www.amazon.com/dp/B09V3KXJPB";

interface Props {
  onRun: (url: string) => void;
  disabled?: boolean;
}

const formStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  width: "100%",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #ccc",
  borderRadius: 4,
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  border: "1px solid #333",
  background: "#222",
  color: "#fff",
  borderRadius: 4,
  cursor: "pointer",
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#999",
  border: "1px solid #999",
  cursor: "not-allowed",
};

export function UrlBar({ onRun, disabled = false }: Props) {
  const [url, setUrl] = useState(DEFAULT_URL);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    setUrl(e.target.value);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!disabled && url.trim()) onRun(url.trim());
  };

  return (
    <form style={formStyle} onSubmit={handleSubmit}>
      <input
        type="url"
        value={url}
        onChange={handleChange}
        placeholder="https://www.amazon.com/dp/ASIN"
        style={inputStyle}
        disabled={disabled}
      />
      <button type="submit" style={disabled ? disabledButtonStyle : buttonStyle} disabled={disabled}>
        {disabled ? "Running..." : "Run 10 personas"}
      </button>
    </form>
  );
}
