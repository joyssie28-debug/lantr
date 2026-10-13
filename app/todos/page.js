import { createClient } from '../../utils/supabase/server';

export default async function TodosPage() {
  const supabase = await createClient();
  const { data: todos, error } = await supabase.from('todos').select('id, name');

  return (
    <>
      <header><a className="logo" href="/">Joy<span>.</span></a></header>
      <main>
        <section className="closing">
          <h1>Todos</h1>
          {error ? (
            <p role="alert">Could not load todos. Please check the table exists and its access policies allow you to read it.</p>
          ) : todos?.length ? (
            <ul>{todos.map((todo) => <li key={todo.id}>{todo.name}</li>)}</ul>
          ) : <p>No todos to show.</p>}
        </section>
      </main>
    </>
  );
}
