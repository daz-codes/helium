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
