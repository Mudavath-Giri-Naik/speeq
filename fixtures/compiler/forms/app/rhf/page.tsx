import { useForm } from "react-hook-form";
export default function Page() {
  const { register } = useForm();
  return <form onSubmit={() => {}}><input {...register("title")} /><input {...register("count")} type="number" /></form>;
}
