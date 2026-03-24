export const updateItemInList = (list, id, updatedItem) => {
  return list.map(item => (item.id === id ? { ...item, ...updatedItem } : item));
};

export const deleteItemFromList = (list, id) => {
  return list.filter(item => item.id !== id);
};

export const addItemToList = (list, newItem) => {
  return [...list, newItem];
};