
		var list = [];

        document.getElementById("list").innerHTML = list;

        display = document.getElementById("list");

        var displayedList = ""


        function addToList(itemID) {

        	var item = itemID.toString();
         	list.push(item);
         	
         }

        function removeFromList(indexToRemove){
        	list.splice(indexToRemove,1);

        }

        function displayMyList(){


        	var displayedList = "";
        	var listCount = list.length;

        
        	for(var i = 0; i < listCount; i++){

        		displayedList += "<li>"+ list[i] + "  " +"<input type='checkbox'  onclick='removeFromList("+i+");displayMyList()'>" + "</li>";


        	}
        	 document.getElementById("list").innerHTML = displayedList;


        }

         
 
   
