const $ = document.querySelector.bind(document);
const API_BASE = "http://localhost:3000";

const todoForm = $("#todo-form");
const todoInput = $("#todo-input");
const submitBtn = $("#submit");
const taskList = $("#task-list");

const todosLoading = $("#todos-loading");

// modal
const modal = $(".modal");
const modalContainer = $(".modal-container");
const modalHeading = $(".modal-heading");
const cancelBtn = $(".modal-cancel");
const confirmBtn = $(".modal-confirm");

let tasks = []; // lưu lại để đỡ phải gọi API nhiều lần

function escapeHTML(html) {
    const div = document.createElement("div");
    div.innerText = html;
    return div.innerHTML;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderTasks() {
    // if 'tasks' array is empty, try to fetch data
    if (!tasks.length) {
        try {
            // display loading effect
            todosLoading.classList.add("show");

            await delay(1000); // add delay to see loading effect
            const response = await axios.get(`${API_BASE}/todos`);
            tasks = response.data;
        } catch (error) {
            console.error("Cannot fetch Task List: ", error);
            taskList.innerHTML = `<li>Cannot fetch Task List!</li>`;
        } finally {
            // hide loading effect
            todosLoading.classList.remove("show");
        }
    }

    // after fetching data, the 'tasks' array is still empty
    if (!tasks.length) {
        taskList.innerHTML = `<li>Your task list is empty!</li>`;
        return;
    }

    const html = tasks
        .map((task) => {
            return `<li class="task-item ${task.completed ? "completed" : ""}" 
            data-id="${task.id}">
                    <span class="task-title">${escapeHTML(task.title)}</span>
                    <div class="task-action">
                        <button class="task-btn edit">Edit</button>
                        <button class="task-btn done">
                            ${
                                task.completed
                                    ? "Mark as undone"
                                    : "Mark as done"
                            }
                        </button>
                        <button class="task-btn delete">Delete</button>
                    </div>
                </li>`;
        })
        .join("");
    taskList.innerHTML = html;
}

// returning 'true' means duplicated
function checkDuplicated(taskTitle) {
    return tasks.some(
        (task) => task.title.toLowerCase() === taskTitle.toLowerCase()
    );
}

function checkEmptyOrDuplicated(taskTitle) {
    // alert if input is empty
    if (!taskTitle) {
        alert("Enter a task!");
        return true;
    }

    // prevent duplicate
    if (checkDuplicated(taskTitle)) {
        alert(`"${taskTitle}" is already in your task list!`);
        return true;
    }

    return false; // not empty and not duplicated
}

async function addNewTask(e) {
    e.preventDefault();

    const newTaskTitle = todoInput.value.trim();

    if (checkEmptyOrDuplicated(newTaskTitle)) return;

    // new task
    const newTask = {
        title: newTaskTitle,
        completed: false, // default is not complete
    };

    // add new task to db and tasks list
    try {
        const response = await axios.post(`${API_BASE}/todos`, newTask);
        tasks.unshift(response.data); // không add trực tiếp newTask object vào tasks vì không có id

        // render
        renderTasks();

        // clear input
        todoInput.value = "";
    } catch (error) {
        console.error(`Cannot add "${newTaskTitle}" task to database: `, error);
        alert(`Cannot add "${newTaskTitle}" task!`);
    }
}

async function handleTaskActions(e) {
    const taskItem = e.target.closest(".task-item");
    if (!taskItem) return;

    const taskId = taskItem.dataset.id; // id property value
    const taskIndex = tasks.findIndex((task) => task.id === taskId); // index in 'tasks' array
    const taskTitle = tasks[taskIndex].title;

    // click EDIT button
    if (e.target.closest(".task-btn.edit")) {
        const taskTitleElement = taskItem.querySelector(".task-title");
        const editBtn = taskItem.querySelector(".task-btn.edit");

        // function to handle user click 'enter'
        const handleEditInputKeyDown = (e) => {
            if (e.key === "Enter") editBtn.click();
        };

        // click EDIT button
        if (e.target.textContent.toLowerCase().includes("edit")) {
            taskTitleElement.innerHTML = `<input id='edit-input' class="edit-input">`;
            const editInput = taskItem.querySelector("#edit-input");
            // gán giá trị input = title ban đầu
            editInput.value = taskTitle;

            // change text to 'SAVE'
            editBtn.textContent = "SAVE";
            // focus
            editInput.focus();

            // handle user click 'enter'
            editInput.addEventListener("keydown", handleEditInputKeyDown);
        }
        // click SAVE button
        else {
            const editInput = taskItem.querySelector("#edit-input");

            const newTaskTitle = editInput.value.trim();

            // check empty or duplicated
            if (checkEmptyOrDuplicated(newTaskTitle)) {
                editInput.focus();
                return;
            }

            // change text back to 'EDIT'
            editBtn.textContent = "EDIT";

            // remove input element
            taskTitleElement.textContent = newTaskTitle;

            // remove event listener on editInput element
            editInput.removeEventListener("keydown", handleEditInputKeyDown);

            // save to db
            try {
                await axios.patch(`${API_BASE}/todos/${taskId}`, {
                    title: newTaskTitle,
                });
            } catch (error) {
                taskTitleElement.textContent = taskTitle;

                console.error(`Cannot update "${newTaskTitle}" task: `, error);
                alert(`Cannot update "${newTaskTitle}" task!`);
                return;
            }

            // save to 'tasks' array
            tasks[taskIndex].title = newTaskTitle;
        }
    }
    // click 'mark as done'
    else if (e.target.closest(".task-btn.done")) {
        const isComplete = !tasks[taskIndex].completed;

        // save to db
        try {
            await axios.patch(`${API_BASE}/todos/${taskId}`, {
                completed: isComplete,
            });
        } catch (error) {
            console.error("Cannot update Complete state: ", error);
            alert("Cannot update Complete state!");
            return;
        }

        // save to task list
        tasks[taskIndex].completed = isComplete;

        renderTasks();
    }
    // click Delete
    else if (e.target.closest(".task-btn.delete")) {
        // basically work but still have a critical bug:
        // flow leads to error:
        /*
        1. click 'delete' button on a random task item -> cancelBtn, modalContainer, modal and especially confirmBtn have been added an event listener.
        2. modal opens -> click 'cancel' 
        3. click 'delete' button again (on the same task item) -> cancelBtn, modalContainer, modal and especially confirmBtn will be added another event listener (TWICE).
        4. click 'confirm' -> the handler function on confirmBtn will run TWICE that lead to error
        */
        // solutions:
        // 1. use Event handle property (onclick) -> outdated
        // 2. remove Event listeners of cancelBtn, modalContainer, modal and ESPECIALLY confirmBtn when user cancels 'delete' action.
        // 3. use event delegation for modal actions

        const handleModalContainerClick = (e) => {
            e.stopPropagation();
        };

        // update content
        modalHeading.textContent = `Do you want to delete "${taskTitle}" task?`;
        // open modal
        modal.classList.add("show");

        cancelBtn.addEventListener(
            "click",
            () => {
                modal.classList.remove("show");
            },
            { once: true }
        );

        modalContainer.addEventListener("click", handleModalContainerClick);

        modal.addEventListener(
            "click",
            () => {
                modal.classList.remove("show");

                // remove event listener on modalContainer
                modalContainer.removeEventListener(
                    "click",
                    handleModalContainerClick
                );
            },
            { once: true }
        );

        confirmBtn.addEventListener(
            "click",
            async () => {
                // hide modal
                modal.classList.remove("show");

                // console.log(tasks);
                // console.log(tasks[taskIndex]);
                // console.log(taskIndex);

                // delete from db
                try {
                    await axios.delete(`${API_BASE}/todos/${taskId}`);
                } catch (error) {
                    console.error(
                        `Cannot delete "${tasks[taskIndex].title}" task: `,
                        error
                    );
                    alert(`Cannot delete "${tasks[taskIndex].title}" task!`);
                    return;
                }

                // remove from 'tasks' list
                tasks.splice(taskIndex, 1);

                renderTasks();
            },
            { once: true }
        );
    }
}

todoForm.addEventListener("submit", addNewTask);
taskList.addEventListener("click", handleTaskActions);

// initialize
renderTasks();
