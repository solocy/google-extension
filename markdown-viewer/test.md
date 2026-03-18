# 测试Markdown文件

## 代码块测试

### JavaScript代码

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
  return true;
}

const user = {
  name: "Alice",
  age: 30
};
```

### Python代码

```python
def calculate_sum(numbers):
    """计算数字列表的总和"""
    total = 0
    for num in numbers:
        total += num
    return total

result = calculate_sum([1, 2, 3, 4, 5])
print(f"Sum: {result}")
```

### HTML代码

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body>
  <h1>Hello World</h1>
  <p>This is a test.</p>
</body>
</html>
```

### 无语言标识的代码块

```
这是一个没有指定语言的代码块
可以包含任意文本
  保持原有的缩进
```

## 行内代码测试

这是一段包含 `inline code` 的文本，还有 `const x = 10;` 这样的代码。

使用 `npm install` 命令安装依赖，然后运行 `npm start` 启动项目。

## 混合内容测试

这是一个**粗体**文本，这是*斜体*文本，这是`行内代码`。

### 列表中的代码

- 第一项包含 `code`
- 第二项：使用 `git commit -m "message"` 提交
- 第三项：
  ```bash
  npm install
  npm start
  ```

### 表格中的代码

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm start` | 启动项目 |
| `npm test` | 运行测试 |

## 特殊字符测试

代码块中的特殊字符应该正确显示：

```javascript
const html = '<div class="test">Hello & goodbye</div>';
const regex = /\d+/g;
const template = `Name: ${name}`;
```

## 多行代码块

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUser(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
```

## 引用中的代码

> 这是一个引用块
>
> 可以包含 `inline code`
>
> ```javascript
> console.log('code in quote');
> ```

## 结束

测试完成！
