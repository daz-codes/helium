function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderTodos(list) {
  return list.map(t => `<li class='todo-item${t.completed ? ' completed' : ''}'>
    <input type='checkbox' class='toggle'${t.completed ? ' checked' : ''} @click='toggleTodo($data, ${t.id})'>
    <span class='todo-text'>${esc(t.text)}</span>
    <button class='destroy' @click='removeTodo($data, ${t.id})'>&#215;</button>
  </li>`).join('');
}

export function addTodo($data) {
  const text = $data.newTodo.trim();
  if (text) {
    $data.todos = [...$data.todos, { id: $data.nextId++, text, completed: false }];
    $data.newTodo = '';
  }
}

export function toggleTodo($data, id) {
  $data.todos = $data.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
}

export function removeTodo($data, id) {
  $data.todos = $data.todos.filter(t => t.id !== id);
}

export function toggleAll($data) {
  const allDone = $data.todos.every(t => t.completed);
  $data.todos = $data.todos.map(t => ({ ...t, completed: !allDone }));
}

export function clearCompleted($data) {
  $data.todos = $data.todos.filter(t => !t.completed);
}
