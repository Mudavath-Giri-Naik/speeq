import { sendMessage } from "../actions";
export default function Page() {
  return (
    <div>
      <form id="contact" action={sendMessage}>
        <input name="email" type="email" required />
        <select name="topic"><option>a</option></select>
        <textarea name="body" />
        <input name="agree" type="checkbox" />
        <input name="size" type="radio" />
      </form>
    </div>
  );
}
