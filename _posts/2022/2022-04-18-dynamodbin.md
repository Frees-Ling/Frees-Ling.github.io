---
layout: post
title: DynamoDB系列之--如何做in查询
category: DynamoDB
tags: [DynamoDB]
excerpt: DynamoDB是亚马逊内部一款功能强大的NoSql数据库，那么DynamoDB怎么实现和mysql一样的in查询呢？
--- 

你好，我是Weiki，欢迎来到猿java。

最近在折腾AWS(亚马逊)的一些产品，开发中用到了DynamoDB这款NoSql数据库，需求是需要对user表做user_id in查询，中间查阅了dynamoDB的很多API doc，最后终于写出了一个可以使用的test demo，代码如下：

```java
import com.amazonaws.services.dynamodbv2.datamodeling.DynamoDBMapper;

public class TestClass {
    @Autowired
    DynamoDBMapper dynamoDBMapper;

    @Test
    public void scanWithInSelectTest() {
        initData();

        List<String> userList = new ArrayList<>();
        userList.add("iamtest");
        userList.add("iamtest2");

        DynamoDBScanExpression queryExpression = new DynamoDBScanExpression();
        queryExpression.setConsistentRead(false);
        String condFilter = "";
        HashMap<String, AttributeValue> attrs = new HashMap<>();
        // 拼装in 的sql语句 
        if (!userList.isEmpty()) {
            condFilter += " #UserId in (" +
                    IntStream.range(0, userList.size()).mapToObj(i -> ":userId" + i).collect(Collectors.joining(","))
                    + ")";
            for (int i = 0; i < userList.size(); i++) {
                attrs.put(":userId" + i, new AttributeValue().withS(userList.get(i)));
            }
            queryExpression.setExpressionAttributeNames(Map.of("#UserId", "UserId"));
        }
        queryExpression.setFilterExpression(condFilter);
        queryExpression.withExpressionAttributeValues(attrs);

        PaginatedScanList<UserModel> jobs = dynamoDBMapper.scan(UserModel.class, queryExpression);
        assertTrue(!jobs.isEmpty());
    }
}
```
我使用的是gradle编译的，aws-java-sdk依赖如下，使用maven可以查看下对应的依赖，最后大家有相关的绣球可以根据实际开发修改对应的代码。
```
dependencies {
    implementation platform("com.amazonaws:aws-java-sdk-bom:$aws_sdk_ver")
  }
```

## 最后

如果你觉得本博文对你有帮助，感谢转发给更多的好友，我们将为你呈现更多的干货， 感谢关注公众号：猿java
